-- Security fix: the catalogue tables cities/programs/universities had RLS
-- DISABLED while the public `anon` role still held INSERT/UPDATE/DELETE/TRUNCATE
-- grants. Because the anon key ships in the browser bundle, anyone could tamper
-- with or wipe the 119k-programme catalogue via PostgREST. The existing
-- programs_admin / universities_admin ALL policies were inert while RLS was off.
--
-- This enables RLS (activating those admin policies), adds public SELECT policies
-- so the app's catalogue browse/search keeps working, and adds a missing admin
-- write policy for cities. Seed scripts use the service-role key (BYPASSRLS) and
-- are unaffected; the admin import route runs as an authenticated admin and is
-- covered by the *_admin policies. Idempotent.

alter table public.cities        enable row level security;
alter table public.programs      enable row level security;
alter table public.universities  enable row level security;

do $$
begin
  -- Public read access (preserve catalogue browse/search for anon + authenticated).
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cities' and policyname='cities_read_all') then
    create policy cities_read_all on public.cities for select to public using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='programs' and policyname='programs_read_all') then
    create policy programs_read_all on public.programs for select to public using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='universities' and policyname='universities_read_all') then
    create policy universities_read_all on public.universities for select to public using (true);
  end if;

  -- Admin write parity for cities (programs/universities already have *_admin).
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cities' and policyname='cities_admin') then
    create policy cities_admin on public.cities for all to public
      using ((select auth_role()) = 'admin') with check ((select auth_role()) = 'admin');
  end if;
end $$;
