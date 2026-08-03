-- Onboarding state — one jsonb column on `profiles`.
--
-- APPLIED to the remote 2026-08-03 and verified. Applied one-off with
-- `npm run db:apply <file>` — the remote migration history diverged from this
-- directory, so `supabase db push` is unsafe (see scripts/apply-sql.ts).
--
-- Written idempotently, so re-running it is a no-op rather than an error. If you
-- are looking at a database where onboarding behaves as though every user is
-- brand new, that is `src/lib/onboarding/state.ts` feature-detecting a missing
-- column — re-apply here rather than editing the app.
--
-- ── Class: SAFE ──────────────────────────────────────────────────────────────
-- Additive only: one nullable-by-default column with a server default. No
-- existing read or write path sees a change, and the app treats a missing key
-- as "not yet done" (src/lib/onboarding/state.ts), so rows that predate this
-- migration behave exactly like brand-new ones.
--
-- WHY A COLUMN AND NOT A TABLE
-- ----------------------------
-- Every field here is a single scalar owned by exactly one profile, read as a
-- unit on the request that renders the shell, and never queried across users.
-- A side table would add a join to the hot path for no aggregate we ever run.
-- If onboarding ever needs per-event history (when each tour step was seen, how
-- many times a checklist item was re-opened), that is the point to split it out
-- — this column is deliberately not that.
--
-- SHAPE (all keys optional; absence means "not done")
--   {
--     "welcomed_at":       timestamptz-ish ISO string — saw the /welcome screen
--     "tour_completed_at": ISO string — finished or dismissed the product tour
--     "checklist_dismissed_at": ISO string — hid the getting-started card
--     "skipped_boosters_at":   ISO string — chose "skip for now" in the wizard
--   }
--
-- The shape is validated in TypeScript (src/lib/onboarding/state.ts), not by a
-- check constraint: these are UI breadcrumbs, and a future key must not require
-- a migration to write. Nothing authorises off this column.

begin;

alter table public.profiles
  add column if not exists onboarding jsonb not null default '{}'::jsonb;

comment on column public.profiles.onboarding is
  'Onboarding breadcrumbs (welcome seen, tour completed, checklist dismissed, boosters skipped). Shape owned by src/lib/onboarding/state.ts. Never an authorisation input.';

-- Defensive: a row written before the default existed could hold NULL if some
-- path inserted an explicit null. `not null` above already forbids it, but the
-- backfill makes re-running this file against a partially-applied database a
-- no-op rather than an error.
update public.profiles set onboarding = '{}'::jsonb where onboarding is null;

commit;
