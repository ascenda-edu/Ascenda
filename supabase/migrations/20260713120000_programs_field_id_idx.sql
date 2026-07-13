-- Composite index for the matching catalogue pager (lib/matching/service.ts):
--
--   select id, metadata from programs
--   where field in ('Computer Science & IT', ...)
--   order by id offset N limit 500
--
-- With only the single-column idx_programs_field, every page bitmap-scans the
-- field matches (tens of thousands of rows incl. jsonb metadata) and re-sorts
-- them before applying offset/limit — several such pages in flight exceed the
-- 8s statement timeout (57014) and the dashboard/matches fall back to
-- "Service unavailable". (field, id) lets each page stream pre-sorted index
-- ranges instead.
create index if not exists idx_programs_field_id on programs (field, id);

analyze programs;
