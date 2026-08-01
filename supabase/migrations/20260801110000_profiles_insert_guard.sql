-- SECURITY: close the profiles INSERT privilege-escalation path.
--
-- NOT APPLIED. Written by the database audit (docs/audit/12-database-design.md,
-- finding F0). Review, then apply one-off via `npm run db:apply <file>`.
--
-- ── The hole ─────────────────────────────────────────────────────────────────
-- profiles_self_access (schema.sql:872) is a FOR ALL policy — it covers INSERT,
-- UPDATE and DELETE — and its predicate is identity (auth.uid() = id), not
-- content. The control that makes that safe is trg_guard_profile_role
-- (schema.sql:1231), which rejects role changes by non-admins. That trigger is
-- registered `before update` ONLY, and there is no separate INSERT policy on
-- profiles anywhere in schema.sql or in any of the 33 migrations.
--
-- So, from the browser console of ANY signed-in account, with the anon key that
-- ships in the bundle:
--
--   await supabase.from('profiles').delete().eq('id', myId);          -- FOR ALL covers DELETE
--   await supabase.from('profiles').insert({ id: myId, role: 'admin' });  -- no trigger fires
--
-- auth_role() (schema.sql:855) now returns 'admin', satisfying all 20 admin
-- policies — every one of which is FOR ALL. That is platform-wide read, write
-- and DELETE on every student's personal information, plus the catalogue.
--
-- The DELETE step is not even required for users provisioned through the
-- Supabase dashboard: nothing in the repo creates a profiles row on signup, so
-- those accounts start with no row and can go straight to the INSERT.
--
-- This is independent of can_act_as_counsellor() and is NOT mitigated by fixing
-- it (docs/audit/11-security-authz.md F1). It is strictly more severe: that
-- grants reads, this grants FOR ALL.
--
-- ── The fix (all four parts are required) ────────────────────────────────────
--   1. an explicit INSERT policy that pins role = 'student'
--   2. the guard trigger re-registered for INSERT, with a tg_op branch
--   3. profiles_self_access split into select + update, with NO self-DELETE
--   4. (separate migration) the auth.users FK, so `id` cannot be minted at all
--
-- ── Compatibility ────────────────────────────────────────────────────────────
-- Nothing in src/ inserts or deletes profiles. The one write path is
-- src/lib/profile/persist-intake.ts:28-34, an upsert of
-- { id, full_name, country, time_zone } that never sets `role`:
--   • new row  → INSERT WITH CHECK sees role at its column default 'student' ✅
--   • existing → ON CONFLICT DO UPDATE keeps the stored role; the SET list does
--                not touch it, so a counsellor/admin upserting their own
--                profile is unaffected ✅
-- Seed scripts use the service-role key (BYPASSRLS) and are unaffected.
--
-- Idempotent: drop-then-create throughout. Safe to re-apply.

-- ── 1. Split the FOR ALL self policy ─────────────────────────────────────────
-- Deliberately NO self-DELETE policy. Deleting a profile cascades ~20 tables
-- (all student PII, applications, matches, help threads, notifications, chat)
-- with no soft delete, no export prompt and no recovery — that is an account
-- closure, not a row write, and belongs behind request_account_deletion().

drop policy if exists profiles_self_access on profiles;
drop policy if exists profiles_self_select on profiles;
drop policy if exists profiles_self_update on profiles;
drop policy if exists profiles_self_insert on profiles;

create policy profiles_self_select on profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_self_update on profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Self-heal path: a user may create their OWN profile row, as a student only.
-- Pairs with the signup trigger added by 20260801130000; until that lands this
-- is what lets a dashboard-provisioned account bootstrap itself safely.
create policy profiles_self_insert on profiles
  for insert to authenticated
  with check (id = (select auth.uid()) and role = 'student');

-- ── 2. Guard both write paths ────────────────────────────────────────────────
-- Unchanged UPDATE semantics (schema.sql:1212-1228); the INSERT branch is new.
-- Server-side contexts (service_role, seed scripts, SQL editor) carry no
-- auth.uid() and stay trusted, as before.

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null
       and new.role is distinct from 'student'
       and not exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    then
      raise exception 'new profiles must be created with role=student';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role then
    if auth.uid() is not null
       and not exists (select 1 from profiles where id = auth.uid() and role = 'admin')
    then
      raise exception 'changing profiles.role requires an administrator';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role on profiles;
create trigger trg_guard_profile_role
  before insert or update on profiles
  for each row
  execute function public.guard_profile_role_change();

-- ── 3. Verify it took effect ─────────────────────────────────────────────────
-- Same instinct as 20260715120000: a security migration that silently no-ops is
-- worse than one that fails loudly.

do $$
declare
  n integer;
begin
  -- No policy may still grant INSERT or DELETE on profiles without pinning role.
  select count(*) into n
  from pg_policies
  where schemaname = 'public'
    and tablename  = 'profiles'
    and cmd in ('ALL', 'DELETE');
  if n > 0 then
    raise exception
      'verification failed: % ALL/DELETE policy(ies) remain on profiles', n;
  end if;

  select count(*) into n
  from pg_policies
  where schemaname = 'public' and tablename = 'profiles'
    and policyname = 'profiles_self_insert'
    and with_check like '%student%';
  if n <> 1 then
    raise exception 'verification failed: profiles_self_insert is missing or does not pin role';
  end if;

  select count(*) into n
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  where c.relname = 'profiles'
    and t.tgname = 'trg_guard_profile_role'
    and (t.tgtype & 4) = 4;   -- TRIGGER_TYPE_INSERT
  if n <> 1 then
    raise exception 'verification failed: trg_guard_profile_role does not cover INSERT';
  end if;

  raise notice 'profiles insert guard: applied and verified';
end $$;
