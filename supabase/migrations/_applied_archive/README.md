# Applied, and unsafe to replay

Migrations in this directory **have been applied to production** and **must never
be run again**. They are kept for the historical record — how the schema reached
its current shape — and moved out of `supabase/migrations/` so that nothing which
globs that directory can reach them.

`supabase/schema.sql` already reflects their result. A database built from
`schema.sql` needs nothing here.

## Why not just delete them?

Deleting would leave `schema.sql` unexplained: several of its stranger shapes
(`archive_raw_*` tables, `*_v2` promotions) only make sense if you can read the
migration that produced them. Git would still hold the file, but a deleted path
is not discoverable by someone reading the schema and asking "why is it like
this?".

## Why not leave them in `migrations/`?

Because `npm run db:apply <file>` takes a filename, and the moment somebody
decides to "replay the migrations to rebuild an environment" they will type one
of these. The CI database gate also had to carry a permanent special-case
excluding them from its replay — a standing exception that would eventually be
mistaken for a place to hide a genuinely broken migration.

---

## `20250308120000_normalize_course_catalog.sql`

**Destructive on replay, not merely non-idempotent.**

It is a one-time catalogue normalisation. Replayed against a database that has
already been normalised, it:

1. renames the LIVE `programs` and `universities` to `archive_raw_programs` /
   `archive_raw_universities`, and
2. promotes the `programs_v2` / `universities_v2` tables it creates in the same
   run — which are **empty**.

So a replay silently archives the live 119k-row catalogue and swaps in nothing.
It also discards `universities.recognition_score`, because `universities_v2`
never declares it — which is why adding that column to `schema.sql` appeared to
have no effect on the CI database gate until the replay itself was removed.

Applied to production: ✅ (confirmed by the presence of `cities` and the
`archive_raw_*` tables — see `supabase/MIGRATIONS.md`).
