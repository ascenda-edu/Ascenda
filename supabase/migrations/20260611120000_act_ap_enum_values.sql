-- Add the ACT pathway and AP subject level to the intake enums.
-- The profile wizard already collects both; until now saveStudentIntake coerced
-- them to A_LEVEL, which silently disabled the ACT→IB conversion and the AP
-- rigour branch in the matching/scoring engines for real (DB-loaded) students.
alter type programme_type add value if not exists 'ACT';
alter type subject_level add value if not exists 'AP';
