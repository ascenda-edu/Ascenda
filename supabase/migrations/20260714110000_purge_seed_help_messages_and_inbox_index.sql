-- Retire the legacy "seeded opening message" help_messages rows, and index the
-- counsellor inbox's newest-first scan.
--
-- Two one-off/idempotent fixes (safe to re-apply; the remote migration history
-- is divergent — see scripts/apply-sql.ts). Only the index is backported into
-- supabase/schema.sql — the DELETE is a data cleanup, not schema.
--
--   1. History: before 2026-07-14 the counsellor Send-message flow seeded a
--      first help_messages row that duplicated the request's own opening body
--      (author_role = the request's initiated_by — historically always
--      'counsellor' — body identical to help_requests.body, created within
--      ~60s of the request). Under the current model help_requests.body IS the
--      opening message (rendered as the synthetic "opening-<id>" entry in
--      ThreadView, help-thread-drawer.tsx), so those seed rows are pure
--      duplicates. They (a) double-count in the student unread badge —
--      countUnreadForStudent (help-request-client.ts) counts the seed AND the
--      opening body adds +1 — and (b) forced a fragile render-layer skip
--      heuristic. This DELETE removes exactly the identifiable seed rows so the
--      heuristic can be retired.
--      No FK dependents: nothing references help_messages(id) (no notifications
--      or other table points at it), so a plain DELETE is safe.
--
--   2. loadCounsellorInbox runs an unfiltered `order by created_at desc limit
--      100` on help_requests. All three existing indexes lead with another
--      column (status / student_profile_id / counsellor_profile_id), so the
--      scan sorts the whole table. Add a created_at-leading index.

-- ── 1. Purge legacy seeded opening messages ─────────────────────────────────
-- For each request, delete only the EARLIEST help_messages row that matches the
-- seed signature (author_role = hr.initiated_by, body = hr.body, created within
-- ±60s of the request). Ranking by created_at and deleting rank 1 only ensures
-- a genuine later reply that happens to repeat the opening text is never
-- touched. Naturally idempotent: a second run finds no matching rows.

with seed_candidates as (
  select
    hm.id,
    row_number() over (
      partition by hm.request_id
      order by hm.created_at, hm.id
    ) as rn
  from help_messages hm
  join help_requests hr on hr.id = hm.request_id
  where hm.author_role = hr.initiated_by
    and hm.body = hr.body
    and hm.created_at between hr.created_at - interval '60 seconds'
                         and hr.created_at + interval '60 seconds'
)
delete from help_messages
where id in (select id from seed_candidates where rn = 1);

-- ── 2. Index the counsellor inbox's newest-first scan ───────────────────────
create index if not exists help_requests_created_idx
  on help_requests (created_at desc);
