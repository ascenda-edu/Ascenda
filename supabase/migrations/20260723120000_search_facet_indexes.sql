-- Indexes for the unified live search page (feat/search-redesign).
--
-- Why: the search redesign filters/sorts the 119k-row programs catalogue
-- directly, and live probing showed two gaps:
--   1. `search_filter_options()` TIMES OUT in production (57014) because its
--      SELECT DISTINCT over programs.study_level / programs.mode has no index
--      support — the search hub has been silently falling back to hardcoded
--      filter lists. study_level/mode indexes fix the RPC and back the new
--      degree-level facet.
--   2. University-side facets (country, ranking) resolve university-id sets
--      before filtering programs; country/rank_overall/recognition_score
--      indexes keep those lookups index-only.
--
-- Idempotent: safe to re-run (create index if not exists).

create index if not exists idx_programs_study_level on programs (study_level);
create index if not exists idx_programs_mode on programs (mode);

create index if not exists idx_universities_country on universities (country);
create index if not exists idx_universities_rank_overall on universities (rank_overall);
create index if not exists idx_universities_recognition_score on universities (recognition_score);

analyze programs;
analyze universities;
