# Ascenda — Claude Code Project Context

## Implementation workflow

Use the agentic loop — **Fable as coordinator** (planning, reviewing, integrating), delegating hands-on coding to **Opus subagents** (`model: "opus"` on Agent/Workflow calls) — for work that's large, parallelizable, or would blow out a single context window (multi-file refactors, independent components built concurrently, broad sweeps). For small or subtle single-threaded changes (RLS/scoping fixes, date-parsing edge cases, targeted bug fixes), Fable should implement directly rather than delegating — the coordinator is the stronger model, and review catches less than writing does.

## Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run typecheck    # tsc --noEmit (run after every change)
npm run lint         # ESLint
npm run test         # Jest (route-handler tests use ./jest.environment-node.js via @jest-environment docblock)

# Regenerate Supabase TypeScript types after schema changes
npm run supabase:types   # requires SUPABASE_PROJECT_ID in env
```

## Architecture

**Next.js 14 App Router** — `src/` is the root (path alias `@/*` maps to `./`).

### Routes
| Route | Who | Notes |
|---|---|---|
| `/dashboard` | Student | Home after login |
| `/university-search/*` | Student | Search hub, results, filters |
| `/matches` | Student | Ranked programme matches |
| `/course/[id]` | Student | Programme detail page |
| `/shortlist` | Student | Saved programmes (localStorage) |
| `/applications` | Student | Priority board (Greg's feature) |
| `/applications/tasks` | Student | Task tracker |
| `/applications/documents` | Student | Document manager |
| `/profile` | Student | Profile wizard & completion |
| `/scholarships` | Student | Scholarship explorer |
| `/toolbox` | Student | Essay workshop, practice tools |
| `/counsellor` | Counsellor | Help requests, student management |
| `/admin` | Admin only | Guarded by `profile.role === 'admin'` |

### Two-role system
- **Student** (`role = 'student'`): uses the full student-facing UI
- **Counsellor** (`role = 'counsellor'`): `/counsellor` dashboard; help requests appear here
- Demo user toggle via `src/lib/demo/` utilities — the demo profile is Greg (student)

### Key directories
```
src/
  app/                    # Next.js App Router pages & API routes
  components/
    layout/               # Shell, SectionNav, PageHero, navigation.ts
    applications/         # Priority board, help modal, calendar
    help/                 # Help thread drawer, help request modal
    toolbox/              # Essay workshop, building blocks
    ui/                   # shadcn/ui primitives
  lib/
    supabase/
      server.ts           # createServerSupabaseClient (Server Components)
                          # createRouteHandlerSupabaseClient (API routes)
      client.ts           # getBrowserSupabaseClient (Client Components, via useSupabase())
    types/
      database.ts         # Auto-generated Supabase types (may lag schema)
      demo-tables.ts      # Manual types for tables added after last generation
    demo/
      help-request-client.ts  # Typed wrappers; casts through `any` intentionally
    matching/             # Programme scoring & tiering logic
```

## Supabase

- **Project ref:** `alpkbobbasxvubogkark`
- **MCP:** configured in `.mcp.json` → `https://mcp.supabase.com/mcp`
- **Dashboard:** https://supabase.com/dashboard/project/alpkbobbasxvubogkark

### Client factories — use the right one
| Factory | File | Use when |
|---|---|---|
| `createServerSupabaseClient()` | `lib/supabase/server.ts` | Server Components, `page.tsx`, `layout.tsx` |
| `createRouteHandlerSupabaseClient()` | `lib/supabase/server.ts` | API route handlers (`route.ts`) |
| `getBrowserSupabaseClient()` via the `useSupabase()` hook | `lib/supabase/client.ts` | Client Components (`'use client'`) |

### Key tables
- `programs` + `universities` — core catalogue (119k+ programmes)
- `profiles` — user records; `role` field: `'student' | 'counsellor' | 'admin'`
- `applications` — student application tracker
- `help_requests`, `help_messages`, `help_notes`, `help_meetings` — counsellor help system
- `notifications` — per-profile notification feed
- `student_personal_information`, `student_academic_input`, `student_subjects`, `student_lifestyle_preference`, `student_scores` — profile data
- `shortlisted_programs` — defined in `schema.sql` but **may not exist on the remote DB**; `shortlist-store.ts` feature-detects (first failed call disables remote sync for the session) and falls back to `localStorage`

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_DB_URL
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET
SUPABASE_PROJECT_ID
```

## Deployment

- **Vercel project:** https://ascenda-ashy.vercel.app
- **Branch:** `main` → auto-deploys to production
- **CI:** GitHub Actions runs lint, typecheck, test, and a production build (placeholder Supabase env vars). Route-handler tests run in a node environment via the `./jest.environment-node.js` wrapper (Node ≥22 webstorage clash — see the file header)

## Gotchas

- **`database.ts` lags the real schema.** Tables added in migrations after the last `supabase gen types` run are not typed. Workaround: add manual types to `src/lib/types/demo-tables.ts` and cast through `any` in one wrapper file (see `lib/demo/help-request-client.ts`).
- **Counsellor notifications fire via DB trigger**, not application code. Don't add `insertNotification` calls on the student side — the trigger handles the counsellor copy.
- **PostgREST `.or()` with spaces in ilike values crashes.** Use `.in('id', [...])` instead of constructing `.or()` strings with university names that contain spaces.
- **Date-only strings (`deadline_date`, `due_date`) must be parsed as LOCAL dates.** `new Date('YYYY-MM-DD')` is UTC midnight and shifts deadlines by the user's UTC offset — use `parseLocalDate`/`daysUntil`/`startOfToday` from `src/lib/utils/dates.ts`.
- **Migrations are applied one-off via `npm run db:apply <file>`** — the remote migration history diverged from `supabase/migrations/`, so `supabase db push` is unsafe (see `scripts/apply-sql.ts` header). Write migrations idempotently.
- **`recognition_score`** column on `universities` — used by search suggestions to prioritise well-known unis (threshold ≥ 5).
- **PageHero** (`src/components/layout/page-hero.tsx`) — shared header used on every student-facing page. Tone prop: `'student'` (default warm) | `'counsellor'` (operational).
- **`@/*` path alias** maps to `src/` — use `@/components/...`, `@/lib/...` etc.
