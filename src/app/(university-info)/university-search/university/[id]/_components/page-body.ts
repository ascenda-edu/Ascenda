/**
 * `UniversityInformation` draws its own page chrome — `min-h-screen`, `pt-28` to
 * clear a navbar, and a `shell-gutter mx-auto max-w-6xl` gutter. This route now
 * sits inside `<DashboardShell>` (see `layout.tsx`), which already supplies all
 * three, so the body has to stand down to plain content: `cn()` in that
 * component runs these classes last, and tailwind-merge drops the ones they
 * conflict with.
 *
 * The real fix is for that component to stop owning page chrome — it lives
 * outside this pass's paths, and its `error.tsx` already used this same seam, so
 * this follows the established escape hatch rather than inventing a second one.
 *
 * It's a module of its own because all three route files need it and `error.tsx`
 * is a client component: importing it from `page.tsx` would drag the server-only
 * Supabase factory into the client bundle.
 */
export const PAGE_BODY_IN_SHELL = 'min-h-0 max-w-none px-0 pb-0 pt-0';
