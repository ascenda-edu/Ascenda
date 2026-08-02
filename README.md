# Ascenda

Ascenda is a Next.js 14 EdTech platform that supports international high-school students on their journey to discover and apply to the best-fit university programs. It integrates Supabase for authentication, database, storage, and edge functions, and provides tooling for counselors and admins.

## Features

- Supabase authentication with email/password and Google OAuth using `@supabase/auth-helpers-nextjs`.
- Role-based dashboards for students and admins powered by Row Level Security.
- Matching engine that scores academic eligibility, preference fit, and outcome signals.
- Student onboarding wizard capturing academics, preferences, and aspirations with Zod validation.
- Application tracker with checklist, deadline timeline, and Supabase-backed document uploads.
- Scholarship discovery workspace with filters, saved awards, and planner handoff.
- Admin data ingestion workflow with CSV parsing, server-side validation, and upsert sync.
- Tailwind CSS + shadcn-inspired UI components with accessible defaults.
- TanStack Query, React Hook Form, Next Intl scaffolding, and Jest unit tests.
- Lightweight analytics hooks to track critical student and admin actions.

## Getting Started

### Prerequisites

- Node.js 20+
- Supabase project

### Installation

```bash
npm install
```

To work from another laptop: clone the repo, install dependencies, configure `.env.local`, and apply the Supabase schema/seed described below.

If your environment does not already have the required toolchain, run the provided setup script (idempotent). It installs Node.js version 20 with `nvm`, ensures build dependencies, and installs npm packages automatically:

```bash
./scripts/setup.sh
```

> The script uses `sudo apt-get` when curl or build tools are missing; omit or adapt those lines for locked-down environments.

### Environment variables

Copy `.env.example` to `.env.local` and supply your Supabase credentials:

```bash
cp .env.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET=application-documents
SUPABASE_PROJECT_ID=your-project-ref   # used by npm run supabase:types
```

> ⚠️ Never expose the service role key to browsers. It is read in server-only contexts.

### Database

Run the schema and seed files using the Supabase SQL editor or CLI:

1. Open `supabase/schema.sql` in the SQL editor and execute it to create tables, enums, policies, and the `application-documents` storage bucket with RLS.
2. Run `supabase/seed.sql` to insert sample records.
3. **Do not** apply `20250308120000_normalize_course_catalog.sql`. It lives in `supabase/migrations/_applied_archive/`, it is already applied to production, and it is *destructive on replay* — it renames the live catalogue to `archive_raw_*` and promotes the empty `*_v2` tables in its place. `cities`, the enhanced catalog columns and the `course_scoring_v1` view are all in `supabase/schema.sql` (step 1), which is the only thing you need. `npm run db:apply` refuses any path under `_applied_archive/`.
4. (Recommended) Regenerate types after applying schema updates:
   ```bash
    npx supabase gen types typescript --project-id <your-project-ref> --schema public,storage > src/lib/types/database.ts
    ```
5. Run `supabase/validate_catalog.sql` to verify counts, FK integrity, and score ranges after import.
6. Optional: run `npx ts-node scripts/validate-catalog.ts` to validate the live Supabase catalog via the API (requires service role key).
4. Optional edge function scaffolding is located in `supabase/functions/update_deadlines`.

### Development

```bash
npm run dev
```

Visit http://localhost:3000 to view the marketing site. Protected routes (`/dashboard`, `/profile`, `/matches`, `/applications`, `/admin`) require an authenticated Supabase session.

### Testing and Quality

- `npm run lint` – Next.js ESLint configuration.
- `npm run typecheck` – TypeScript compiler in check mode.
- `npm test` – Jest unit tests (includes matching engine coverage).
- `VERBOSE_SCORING=1 npm test` – as above, plus the scoring/matching diagnostic reports (score breakdowns, band tables, per-profile programme matches). These are silenced by default; `VERBOSE_TESTS=1` is an equivalent catch-all. See `__tests__/helpers/report.ts`.

Continuous integration via GitHub Actions runs the above commands on pushes and pull requests targeting `main`.

### Project Structure Highlights

- `src/app` – App Router pages and API routes.
- `src/components` – Reusable UI primitives and domain-specific components.
- `src/lib` – Supabase helpers, utilities, validation, and matching engine.
- `supabase` – SQL schema, seed data, and edge function scaffolding.
- `__tests__` – Jest test suite.

### Admin Imports

The admin console (`/admin`) includes a CSV import panel for `universities`, `programs`, `requirements`, and `deadlines`. Parsing is handled with PapaParse and can be extended to call Supabase RPC endpoints or the `update_deadlines` edge function exposed at `/api/admin/update-deadlines`.

### Additional Notes

- Matching results are available via `/api/match` and cached client-side.
- The UI is responsive, keyboard accessible, and i18n-ready through `next-intl` scaffolding.
- Analytics hooks are left as TODOs for future instrumentation.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Lint via ESLint |
| `npm run typecheck` | Static type checking |
| `npm test` | Run Jest unit tests |
| `npm run seed` | Helper placeholder reminding how to run SQL seed |
| `npm run supabase:types` | Regenerate Supabase types (requires `SUPABASE_PROJECT_ID` and Supabase CLI) |

## Plan & Assumptions

- The matching engine works with normalized Supabase records; additional indexes and materialized views may improve performance in production.
- Storage bucket `application-documents` is created via `supabase/schema.sql` with RLS policies aligned to application ownership; keep `NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET` in sync if you rename it.
- Regenerate `src/lib/types/database.ts` whenever the Supabase schema changes to maintain typed queries.
- Edge function deployment (`update_deadlines`) requires the Supabase CLI and service-role key.
