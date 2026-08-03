-- Supabase-only objects, stubbed so stock Postgres can parse this repo's SQL.
--
-- `supabase/schema.sql` and the migrations target a Supabase database: they
-- reference the `auth` and `storage` schemas, `auth.uid()`/`auth.jwt()`, the
-- `service_role`/`authenticated`/`anon` roles, and the `supabase_realtime`
-- publication — none of which exist in stock Postgres. These stubs let the DDL
-- parse so the SHAPE of the schema is verified. They do NOT emulate RLS: the
-- `database` CI job proves the schema builds, not that the policies are correct.
-- (For policy correctness see `__tests__/db/policy-invariants.sql` and
-- `__tests__/db/rls-negative-cases.sql`.)
--
-- This file is the single source of truth for the stub. `.github/workflows/ci.yml`
-- and `scripts/ci-db-local.sh` both feed it to psql via `scripts/ci-db-check.sh`,
-- so a local run and a CI run cannot drift apart.

create extension if not exists pgcrypto;
-- pg_trgm lives in `extensions` on Supabase but is unqualified here; installing
-- it into public keeps unqualified opclass references resolvable.
create extension if not exists pg_trgm;

create schema if not exists auth;

-- `email` is NOT optional in this stub. schema.sql:1902 and 20260801122000 both
-- read auth.users.email, and a SQL-language function body is validated at CREATE
-- time — so a bare (id uuid) table fails the whole run with 42703 "column
-- u.email does not exist" before a single policy is reached. The columns here
-- are exactly those the repo's SQL touches; this is not an attempt to model
-- auth.users faithfully.
create table if not exists auth.users (
  id uuid primary key,
  email text
);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;

-- schema.sql:1104 inserts a bucket and policies storage.objects. Without these
-- the run aborts at 3P01 "schema storage does not exist".
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  metadata jsonb
);

-- Supabase creates this publication for every project; Realtime replicates from
-- it. Three files write to it, and only some of them check that it exists:
--   * schema.sql:1506 and 20260718130000:23 guard with `if exists (select 1 from
--     pg_publication ...)` — but 20260718130000:37 then RAISEs when it is
--     missing, which is correct behaviour against a real project and fatal here.
--   * 20260512120000:52-53 and 20260513120000:63-65 do a bare
--     `alter publication supabase_realtime add table ...` with no guard at all.
-- Without this stub the replay died on the FIRST migration and the nine
-- unapplied ones were never reached — which is why this job had never run green.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role anon;          exception when duplicate_object then null; end $$;
do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
