-- Step 6 — one gate for every notification writer (F6).
--
-- ⚠️  NOT APPLIED. Written for review by the database audit
--     (docs/audit/12-database-design.md §3.4, migration plan step 6). Read it,
--     then apply one-off with `npm run db:apply <file>`. Nothing here has been
--     executed against any database.
--
-- ── Class: SAFE ──────────────────────────────────────────────────────────────
-- Length bounds TRUNCATE rather than raise, deliberately: a legitimate 400-char
-- help-request subject must never fail the INSERT that triggered the
-- notification. The two things that DO raise (a malformed `kind`, a non-root
-- `href`) are values no current writer produces — every kind in the schema and
-- in src/ is already snake_case, every href already starts with '/'.
--
-- The ONE behaviour change that can reject a write today is section 3's
-- recipient check. See its header for the exact flow it blocks and why that
-- flow is the finding rather than a regression.
--
-- ── App change required ──────────────────────────────────────────────────────
-- None in src/ — no application code inserts into `notifications` (verified:
-- the only direct writer is the doc_nudge path, already bounded by
-- notifications_insert since 20260715120000).
--
-- Two follow-ups this migration DOES make necessary, both in SQL:
--   1. notify_on_help_request_insert() is rewritten below to pass the student to
--      counsellor_notification_targets(). The other five notify_* triggers are
--      left alone — they address a single known recipient and do not fan out.
--   2. supabase/schema.sql must be backported (step 2 of the plan) or a fresh
--      database rebuilt from it will lack this gate entirely.
--
-- ── Why this matters ─────────────────────────────────────────────────────────
-- Six SECURITY DEFINER triggers write rows into `notifications` FOR A DIFFERENT
-- USER, and five of them interpolate uncapped, caller-controlled text:
--
--   notify_on_deck_assignment_insert   new.message, deck_name
--   notify_on_help_request_insert      new.subject, new.university, new.program
--   notify_on_help_request_accepted    new.university, new.program
--   notify_on_help_message_insert      author_name (self-writable profiles.full_name)
--   notify_on_help_meeting_insert      new.title
--   notify_on_help_meeting_status      new.title, actor_name
--
-- The notifications_insert POLICY (schema.sql:1533-1552) went to real trouble to
-- bound the direct path — fixed kind, root-relative href, title ≤ 160, body ≤
-- 300 — and its own header at 20260715120000:14 concedes that the triggers walk
-- straight past all of it, because RLS does not apply to a SECURITY DEFINER
-- writer. Patching six trigger bodies leaves the class open for the seventh.
-- A BEFORE trigger on the TARGET table is the only place that binds every
-- writer, definer or not, present or future.
--
-- BEFORE INSERT **OR UPDATE**, not INSERT alone. Without the UPDATE arm the gate
-- is a two-step bypass: insert a compliant row, then UPDATE it to the payload
-- you wanted. Today notifications_update is self-scoped so that only rewrites
-- your own feed — but the definer triggers are not bound by that policy either,
-- and the whole point of this file is to stop reasoning writer-by-writer.
--
-- ── Ordering constraint (files apply in FILENAME order) ──────────────────────
-- Must sort AFTER 20260801122000_counsellor_assignments.sql. Section 3's
-- recipient check and section 4's targets overload both read
-- `counsellor_assignments`, which that file creates. Placed earlier, the replay
-- aborts with 42P01 on a fresh database.
-- No dependency on 20260801120000 (is_admin is not used here) or on
-- 20260802100000.
--
-- ── Reversal ─────────────────────────────────────────────────────────────────
--   drop trigger if exists trg_bound_notification_payload on notifications;
--   drop function if exists public.bound_notification_payload();
--   drop function if exists public.notification_recipient_allowed(uuid);
--   drop function if exists public.counsellor_notification_targets(uuid);
--   alter table deck_assignments drop constraint if exists deck_assignments_message_len;
-- and restore notify_on_help_request_insert() from supabase/schema.sql:1916-1951.
-- The zero-argument counsellor_notification_targets() is never touched, so the
-- fan-out reverts with the function body alone.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Who is allowed to receive a notification from whom
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER for the same reason auth_role() and is_counsellor() are
-- (schema.sql:840-847). Called from a BEFORE trigger that may be running as
-- `authenticated` (the direct doc_nudge insert), where an invoker-rights read of
-- `profiles` or `counsellor_assignments` would be RLS-filtered and return a
-- FALSE NEGATIVE — blocking a legitimate notification. Definer rights make the
-- answer depend on the data, not on the reader.
--
-- No recursion risk: none of the three tables read here has a policy that reads
-- `notifications` (the invariant 20260713130000 established).

create or replace function public.notification_recipient_allowed(p_recipient uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Service role, migrations, seed scripts and the SQL editor have no JWT.
    -- They are already trusted; RLS does not apply to them either.
    auth.uid() is null
    -- Self-notify.
    or p_recipient = auth.uid()
    -- An active counsellor↔student edge, in EITHER direction: a counsellor
    -- notifying their student, and a student's action notifying their
    -- counsellor, are both legitimate.
    or exists (
      select 1 from counsellor_assignments a
      where a.status = 'active'
        and ((a.counsellor_profile_id = auth.uid() and a.student_profile_id = p_recipient)
          or (a.student_profile_id    = auth.uid() and a.counsellor_profile_id = p_recipient))
    )
    -- An active guardian edge, either direction.
    or exists (
      select 1 from guardian_links g
      where g.status = 'active'
        and ((g.parent_profile_id  = auth.uid() and g.student_profile_id = p_recipient)
          or (g.student_profile_id = auth.uid() and g.parent_profile_id  = p_recipient))
    )
    -- The duty pool. A help request from a student with no assigned counsellor
    -- has to reach SOMEBODY, so staff inboxes stay reachable by any user. This
    -- is a deliberate hole, and a small one: the payload is capped at 160/300
    -- characters by section 2, and the recipients are staff, not other students.
    -- Cross-STUDENT injection — the actual finding — is closed.
    or exists (
      select 1 from profiles p
      where p.id = p_recipient and p.role in ('counsellor', 'admin')
    );
$$;

grant execute on function public.notification_recipient_allowed(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. + 3. The gate itself
-- ─────────────────────────────────────────────────────────────────────────────
-- Not SECURITY DEFINER: it delegates the only privileged read to the definer
-- helper above and otherwise touches nothing but NEW. A definer trigger that
-- needs no definer rights is an unnecessary escalation.

create or replace function public.bound_notification_payload()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- ── kind ──
  -- A regex, not an allowlist. `notifications.kind` is assembled dynamically in
  -- at least one trigger ('help_meeting_' || new.status, schema.sql), so a fixed
  -- IN list would break the moment a status value is added — a failure that
  -- would surface as a meeting update erroring out, far from this file. The
  -- regex bounds the shape and the length, which is what the injection needs.
  if new.kind is null or new.kind !~ '^[a-z][a-z0-9_]{0,48}$' then
    raise exception 'notifications.kind must be a short snake_case token, got %', new.kind
      using errcode = 'check_violation';
  end if;

  -- ── href ──
  -- Root-relative only. `//evil.example` is protocol-relative and navigates
  -- OFF-SITE from a link rendered inside a trusted notification drawer, so the
  -- leading-slash test alone is not enough — both conditions are required.
  if new.href is not null and (new.href !~ '^/' or new.href like '//%') then
    raise exception 'notifications.href must be root-relative, got %', new.href
      using errcode = 'check_violation';
  end if;

  -- ── recipient ──
  -- The relationship constraint. Checked only when there IS an actor: a null
  -- auth.uid() means service role or migration, which section 1 already trusts.
  --
  -- The one legitimate flow this can block: a counsellor acting on a student who
  -- has NO active counsellor_assignments row (a deck assignment, a
  -- counsellor-initiated help thread). That is not a regression, it is the
  -- finding — deck_assignments_write checks DECK ownership and never the student
  -- (11-security F6), and help_requests_insert accepts an arbitrary
  -- student_profile_id. The unblock is to create the assignment, which is the
  -- product-correct action and is what 20260801122000's backfill already did for
  -- every seeded student.
  if auth.uid() is not null and not public.notification_recipient_allowed(new.profile_id) then
    raise exception
      'notifications: % may not notify % — no active counsellor_assignments or '
      'guardian_links edge, and the recipient is not staff. Create the assignment first.',
      auth.uid(), new.profile_id
      using errcode = 'insufficient_privilege';
  end if;

  -- ── length ──
  -- TRUNCATE, never raise. A 400-character help-request subject must not fail
  -- the help_requests INSERT that produced it. Whitespace is collapsed first so
  -- a payload cannot buy itself extra visible length with newlines, and so the
  -- 160-character budget is spent on characters a user can actually read.
  new.title := left(regexp_replace(coalesce(new.title, ''), '\s+', ' ', 'g'), 160);
  new.body  := left(regexp_replace(new.body, '\s+', ' ', 'g'), 300);

  if new.title = '' then
    raise exception 'notifications.title must not be empty'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bound_notification_payload on notifications;
create trigger trg_bound_notification_payload
  before insert or update on notifications
  for each row execute function public.bound_notification_payload();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Bound the deck-assignment message at source (belt and braces)
-- ─────────────────────────────────────────────────────────────────────────────
-- The gate above truncates the notification. This stops the 100 kB blob being
-- stored on `deck_assignments` in the first place, where the student's deck view
-- renders it in full.
--
-- NOT VALID first, then validated separately: adding a validated CHECK takes an
-- ACCESS EXCLUSIVE lock for a full table scan, and — more importantly — ABORTS
-- the whole migration if a single existing row violates it. NOT VALID enforces
-- on every future insert and update immediately, which is the security property;
-- validation is only about the past.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deck_assignments_message_len'
      and conrelid = 'public.deck_assignments'::regclass
  ) then
    alter table deck_assignments
      add constraint deck_assignments_message_len
      check (message is null or char_length(message) <= 280) not valid;
  end if;
end $$;

do $$
declare
  violations integer;
begin
  select count(*) into violations
  from deck_assignments where char_length(message) > 280;

  if violations = 0 then
    -- No-op if already validated; safe to replay.
    alter table deck_assignments validate constraint deck_assignments_message_len;
    raise notice 'deck_assignments_message_len validated (no existing violations)';
  else
    raise warning 'deck_assignments_message_len left NOT VALID — % existing row(s) exceed 280 '
                  'chars. Future writes ARE enforced. To finish: '
                  'update deck_assignments set message = left(message, 280) where char_length(message) > 280; '
                  'then: alter table deck_assignments validate constraint deck_assignments_message_len;',
                  violations;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Relationship-scope the fan-out
-- ─────────────────────────────────────────────────────────────────────────────
-- ⛔ THE ARGUMENT IS REQUIRED. DO NOT GIVE IT A DEFAULT.
--
--    counsellor_notification_targets() already exists with ZERO arguments
--    (schema.sql:1893) and is called with zero arguments from a trigger body.
--    Declaring this overload as `(p_student uuid default null)` — which is how
--    the audit sketches it (§3.4) — makes that existing zero-argument call
--    AMBIGUOUS: Postgres matches both candidates and raises 42725 "function is
--    not unique" AT CALL TIME. Every help-request insert on the platform would
--    start failing, with nothing in this migration having errored.
--
--    A required argument keeps the two signatures distinguishable. The zero-arg
--    function is left in place, untouched, as the duty-pool fallback and as the
--    rollback lever.

create or replace function public.counsellor_notification_targets(p_student uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  -- The student's own active counsellors.
  select a.counsellor_profile_id
    from counsellor_assignments a
   where a.student_profile_id = p_student
     and a.status = 'active'
  union
  -- Fallback: a student with no assignment reaches the duty pool, exactly as
  -- today. Without this arm, an unassigned student's help request would notify
  -- nobody — silently, since a notification that is never inserted raises
  -- nothing anywhere.
  select p.id
    from profiles p
   where p.role in ('counsellor', 'admin')
     and not exists (
       select 1 from counsellor_assignments a2
        where a2.student_profile_id = p_student and a2.status = 'active'
     )
  union
  -- The single-account demo (greg@workiflow.com) holds the counsellor inbox but
  -- is role='student'; resolve via auth.users, as the zero-arg function
  -- (schema.sql:1902) and the guardian_links seed already do. Dropping this
  -- would empty the demo's inbox on deploy.
  select u.id
    from auth.users u
   where lower(u.email) = 'greg@workiflow.com'
     and not exists (
       select 1 from counsellor_assignments a3
        where a3.student_profile_id = p_student and a3.status = 'active'
     );
$$;

grant execute on function public.counsellor_notification_targets(uuid) to authenticated;

-- Repoint the one trigger that fans out. Body transcribed verbatim from
-- schema.sql:1916-1951 with a SINGLE change — the argument on line marked
-- `-- CHANGED`. The trigger registration (trg_help_request_notify) binds to the
-- function by name, so replacing the body is sufficient; the trigger is not
-- re-created here on purpose, to avoid a window with no trigger attached.
--
-- The other five notify_* triggers are NOT rewritten: each targets one known
-- recipient (the student, or the thread's counsellor), so there is no fan-out to
-- scope. Their uncapped interpolations are handled by section 2, which is the
-- whole reason that gate lives on the target table.

create or replace function notify_on_help_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  student_name text;
begin
  if new.initiated_by = 'counsellor' then
    -- Counsellor reached out first: notify the student.
    insert into notifications (profile_id, kind, title, body, href, audience)
    values (
      new.student_profile_id,
      'counsellor_message',
      'Message from your counsellor',
      coalesce(new.subject, new.body),
      '/inbox?help=' || new.id::text,
      'student'
    );
  else
    -- Student raised a help request: fan out to the counsellor side.
    student_name := coalesce(public.profile_display_name(new.student_profile_id, null), 'A student');
    insert into notifications (profile_id, kind, title, body, href, audience)
    select
      target,
      'help_request',
      'New help request from ' || student_name,
      coalesce(new.university || coalesce(' · ' || new.program, ''), new.subject),
      '/counsellor/inbox?help=' || new.id::text,
      'counsellor'
    from public.counsellor_notification_targets(new.student_profile_id) as target;  -- CHANGED
  end if;
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Verify
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  n integer;
begin
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'notifications'
      and t.tgname = 'trg_bound_notification_payload' and not t.tgisinternal
  ) then
    raise exception 'verification failed: trg_bound_notification_payload is not attached to notifications';
  end if;

  -- 1 << 2 is INSERT, 1 << 4 is UPDATE in pg_trigger.tgtype. Both arms are
  -- load-bearing (see the header) — assert them rather than trusting the DDL,
  -- which is precisely the mistake trg_guard_profile_role made by covering
  -- UPDATE only and reading as though it covered everything.
  select t.tgtype into n
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
  where c.relname = 'notifications' and t.tgname = 'trg_bound_notification_payload';
  if (n & 4) = 0 or (n & 16) = 0 then
    raise exception 'verification failed: trg_bound_notification_payload does not cover both INSERT and UPDATE (tgtype=%)', n;
  end if;

  -- The ambiguity trap from section 5: exactly two overloads must exist, one
  -- with zero arguments and one with one, and NEITHER may declare a default.
  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'counsellor_notification_targets';
  if n <> 2 then
    raise exception 'verification failed: expected 2 counsellor_notification_targets overloads, found %', n;
  end if;

  select count(*) into n
  from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public' and p.proname = 'counsellor_notification_targets'
    and p.pronargdefaults > 0;
  if n <> 0 then
    raise exception 'verification failed: counsellor_notification_targets has a DEFAULT — '
                    'the existing zero-argument call site is now ambiguous (42725)';
  end if;

  raise notice 'notification bounds verified: gate attached to INSERT+UPDATE, 2 unambiguous fan-out overloads';
end $$;
