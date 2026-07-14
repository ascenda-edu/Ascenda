# Verify — Ascenda

How to drive the running app to verify a change end-to-end.

## Launch

```bash
npm run dev   # localhost:3000, ready in ~3s, reads .env.local
```

## Get an authenticated session (no browser needed)

Password login via `@supabase/ssr` produces the exact cookies the Next.js
server clients expect. Mint them with a small tsx script (run from the repo
root so `.env.local` resolves; `NODE_PATH` so scratchpad scripts find deps):

```ts
// login-cookies.ts — prints "name=value; ..." for curl -b
import { createServerClient } from '@supabase/ssr';
const jar = new Map<string, string>();
const supabase = createServerClient(URL, ANON_KEY, {
  cookies: {
    getAll: () => [...jar.entries()].map(([name, value]) => ({ name, value })),
    setAll: (cs) => cs.forEach(({ name, value }) => jar.set(name, value)),
  },
});
await supabase.auth.signInWithPassword({ email, password });
console.log([...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; '));
```

```bash
NODE_PATH=$PWD/node_modules npx tsx /path/to/login-cookies.ts > cookies.txt
curl -b "$(cat cookies.txt)" http://localhost:3000/<route>
```

### Test accounts

- Seeded students: `aarav.sharma.0+seed@ascenda.demo` (pattern
  `first.last.N+seed@ascenda.demo`, N = index) / password `AscendaSeed!2026`
  (see `scripts/seed-students.ts`). Safe to create/delete data on these.
- `greg@workiflow.com` is the real demo user — its password is NOT the
  seed default; don't assume `AscendaDemo!2026` works.

The user's access token (for direct PostgREST reads/cleanup under RLS) is
inside the cookie: strip `base64-`, base64url-decode, `.access_token`.
The JWT `sub` claim is the profile id.

## Drive

- Server-rendered pages: curl + grep the HTML for expected strings (RSC
  streams duplicate strings — payload + HTML — so expect count 2).
- API routes: curl with the cookie jar; probe unauthenticated (expect 401),
  malformed body (400), idempotent re-POST.
- Counsellor APIs work for ANY signed-in user (`can_act_as_counsellor()` is
  open for the demo) — a seeded student can create decks and assign to itself,
  which makes single-account end-to-end loops easy.
- No Playwright/puppeteer in the repo — don't download a browser for a
  screenshot; SSR HTML captures are the accepted evidence.

## Clean up

Delete test artifacts through the app's own DELETE routes where they exist;
otherwise PostgREST DELETE with the user's own token (self-service RLS
covers own applications/notifications rows). Direct `SUPABASE_DB_URL`
writes are blocked by the permission classifier — stay at the app/user layer.
