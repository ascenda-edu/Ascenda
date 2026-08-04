import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';
import { COMPLETION_COLUMNS, isProfileEssentialComplete } from '@/lib/profile/completion';
import { isOnboardingGated } from '@/lib/onboarding/destination';

/**
 * The short-lived verdict cache, and the reason it carries a version.
 *
 * This cookie caches "does this user still need the setup flow" for up to 12h so
 * a protected navigation costs zero queries instead of four. That is safe only
 * while the cached answer means the same thing as a freshly-computed one.
 *
 * The 2026-08-03 re-tiering broke that: the threshold moved from all five wizard
 * steps to the three ESSENTIAL ones, so a cookie written the hour before a deploy
 * can say `pending` about a user the new rule considers complete. That is not
 * merely stale — it is unrecoverable. The `pending` fast path below redirects to
 * `/welcome` without re-querying, `/welcome` reads the database fresh, sees a
 * complete profile and forwards them onward, and middleware bounces them right
 * back. ERR_TOO_MANY_REDIRECTS until the cookie ages out an hour later.
 *
 * The old redirect target hid this: `/profile/wizard` is exempt from the gate, so
 * a wrong `pending` cost a wasted screen and terminated. `/welcome` forwards, so
 * it loops. `lib/onboarding/destination.ts` closed the role-shaped version of
 * exactly this bug; this is the cache-shaped one.
 *
 * So the name carries the rule-set version, and a cookie from any other version
 * is simply not found — one re-query, then correct. **Bump this whenever the
 * completeness threshold changes** (today: `isProfileEssentialComplete`).
 *
 * `onboarding_complete` deliberately does NOT get the same treatment. A stale
 * value there is still *correct*: it was written under a stricter rule, and
 * "complete under all five steps" implies "complete under the three essentials",
 * so it can only ever cause a redirect to be skipped — never a wrong one.
 */
const ONBOARDING_STATUS_COOKIE = 'onboarding_status_v2';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/profile',
  '/welcome',
  '/matches',
  '/applications',
  '/admin',
  '/university-search',
  '/course',
  '/shortlist',
  '/scholarships',
  '/counsellor',
  '/parent',
  '/role-select',
  '/inbox',
  '/assistant',
  // Both were student-facing pages that middleware never ran for. `/toolbox`
  // was covered by its own layout guard; `/appointment` had none, and served
  // the full signed-in shell — sidebar and all — to an anonymous visitor
  // (verified with an unauthenticated GET against production).
  '/toolbox',
  '/appointment'
];

/**
 * The ONLY `/api` paths that may be reached without a session.
 *
 * Everything else under `/api` fails closed (401) before the handler runs, so a
 * new route that forgets its own `getUser()` is not silently public — which is
 * exactly how this matcher failed before: it listed page prefixes only, so
 * middleware never executed for `/api/*` at all and every handler was on its
 * own honour system.
 *
 * `/api/calendar-feed` is anonymous by design: external calendar clients
 * subscribe to the URL and cannot present a Supabase cookie. It is already
 * throttled per client IP (see its own `checkRateLimit` call).
 */
const PUBLIC_API_PREFIXES = ['/api/calendar-feed'];

/**
 * Cheap plausibility check. **This is not authentication and does not make a
 * handler safe.**
 *
 * It tests only that a cookie with the Supabase auth-token NAME exists. It does
 * not read, decode or validate the value, so `Cookie: sb-x-auth-token=junk`
 * passes it. Its whole job is to reject the large class of drive-by
 * unauthenticated requests without paying for a `getUser()` round trip on every
 * API call — `getUser()` hits the auth server, and every protected handler
 * already does that for itself.
 *
 * **The handler is the authentication boundary, not this.** An earlier version of
 * this comment claimed that a route which forgets its own `getUser()` "is not
 * silently public". That was false and is exactly the kind of assurance someone
 * would build on: such a route is reachable by anyone willing to set a junk
 * cookie. If you add a route, it authenticates itself.
 */
const hasSessionCookie = (req: NextRequest) =>
  req.cookies.getAll().some((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name));

/**
 * Server-to-server callers present `Authorization`, never a cookie.
 *
 * `/api/admin/catalog-health` accepts an `ADMIN_API_KEY` bearer for CLI/cron use.
 * Gating on the cookie alone 401'd those callers here, before the route could
 * check the key — a regression introduced when this fence was added, and one no
 * test covered because nothing exercises the bearer path.
 *
 * Presence of the header is not authorisation: the route still does a
 * `timingSafeEqual` against the configured key and rejects it if it does not
 * match. This only declines to answer on the route's behalf.
 */
const hasAuthorizationHeader = (req: NextRequest) => req.headers.has('authorization');

export async function middleware(req: NextRequest) {
  // API requests are handled before the Supabase client is constructed: they must
  // never be answered with a redirect to an HTML page, and they must not pay for
  // the onboarding machinery below.
  if (req.nextUrl.pathname.startsWith('/api/')) {
    const { pathname } = req.nextUrl;
    const isPublicApi = PUBLIC_API_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
    );

    if (!isPublicApi && !hasSessionCookie(req) && !hasAuthorizationHeader(req)) {
      // `error` is a flat string because that is what all 23 route handlers
       // return and what the six `data.error ?? '…'` call sites consume. A
       // nested `{ code, message }` here is truthy, so `??` never falls back and
       // the object itself reaches the UI — `[object Object]` in five places, and
       // in `essay-ai-panel.tsx` a React "Objects are not valid as a React child"
       // throw that unmounts the panel. `res.json()` is untyped, so no compiler
       // catches it; `middleware.test.ts` is the only guard. Keep it flat.
      return NextResponse.json(
        { error: 'Authentication required.', code: 'unauthenticated' },
        { status: 401 }
      );
    }

    return NextResponse.next();
  }

  const res = NextResponse.next();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: '', ...options });
        },
      },
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;

  // Registration is disabled for the design-partner build. Any visit to the
  // legacy /signup route is redirected to the login page.
  if (pathname.startsWith('/signup')) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.search = '';
    const redirectResponse = NextResponse.redirect(redirectUrl);
    res.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuthRoute = pathname.startsWith('/login');

  // Helper to carry over cookies to redirects
  const applyCookies = (source: NextResponse, target: NextResponse) => {
    source.cookies.getAll().forEach((cookie) => {
      target.cookies.set(cookie);
    });
  };

  const getOnboardingStatus = async (response: NextResponse) => {
    if (!user) {
      return false;
    }

    const cachedUserId = req.cookies.get('onboarding_complete')?.value;
    if (cachedUserId === user.id) {
      return false;
    }

    const statusCookie = req.cookies.get(ONBOARDING_STATUS_COOKIE)?.value;
    if (statusCookie) {
      const [userId, status, timestamp] = statusCookie.split(':');
      const ageMinutes = timestamp ? (Date.now() - Number(timestamp)) / (1000 * 60) : Number.POSITIVE_INFINITY;
      if (userId === user.id) {
        if (status === 'complete') {
          response.cookies.set('onboarding_complete', user.id, {
            path: '/',
            maxAge: 60 * 60 * 24 * 30,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
          });
          return false;
        }
        if (status === 'pending' && ageMinutes < 60) {
          return true;
        }
      }
    }

    // Column lists come from COMPLETION_COLUMNS, never written out here. The
    // hand-written list this replaced omitted `english_status`, which flipped
    // the answer for every student who chose "Not sure" on the English question:
    // they were bounced to /profile/wizard from every protected route, cached for
    // 12h by cookie, while the dashboard showed them 100% complete.
    const [personalResponse, academicResponse, lifestyleResponse, subjectsResponse] = await Promise.all([
      supabase.from('student_personal_information').select(COMPLETION_COLUMNS.personal).eq('profile_id', user.id).maybeSingle(),
      supabase.from('student_academic_input').select(COMPLETION_COLUMNS.academicInput).eq('profile_id', user.id).maybeSingle(),
      supabase.from('student_lifestyle_preference').select(COMPLETION_COLUMNS.lifestyle).eq('profile_id', user.id).maybeSingle(),
      supabase.from('student_subjects').select('id', { count: 'exact', head: true }).eq('profile_id', user.id)
    ]);

    // A failed read is not an empty profile. Every one of these returns
    // `data: null` on error, which `isProfileComplete` cannot tell apart from
    // "never filled in" — so one transient blip bounced a *complete* student to
    // the wizard and cached `pending`, which the fast path above then honours for
    // the next 60 minutes without re-querying. An hour locked out of the app.
    //
    // Fail open, and cache nothing. The wizard redirect is a completeness nudge,
    // not an authorization boundary: letting a request through exposes nothing,
    // and the next request re-checks. Writing either cookie here would persist a
    // verdict this request never actually established.
    const completionError =
      personalResponse.error ?? academicResponse.error ?? lifestyleResponse.error ?? subjectsResponse.error;

    if (completionError) {
      console.error('[middleware] completion check failed; not redirecting', completionError);
      return false;
    }

    const completionRecords = {
      personal: personalResponse.data,
      academicInput: academicResponse.data,
      subjectCount: subjectsResponse.count ?? 0,
      lifestyle: lifestyleResponse.data
    };

    // ESSENTIALS, not the full five steps. `isProfileComplete` includes the two
    // booster steps, whose own completion rule is "a lifestyle row exists" —
    // gating the entire app on those meant a new student met a five-screen form
    // before they had seen a single university. See src/lib/profile/steps.ts.
    //
    // The cookie names below still say `onboarding_*` and now cache the
    // essentials verdict. That is intentional: renaming them would make every
    // already-issued cookie miss, and the value they carry ("does this user
    // still need the setup flow") has not changed meaning, only threshold.
    const needsOnboarding = !isProfileEssentialComplete(completionRecords);

    if (!needsOnboarding) {
      response.cookies.set('onboarding_complete', user.id, {
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
      });
      response.cookies.set(ONBOARDING_STATUS_COOKIE, `${user.id}:complete:${Date.now()}`, {
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
      });
    } else {
      response.cookies.set(ONBOARDING_STATUS_COOKIE, `${user.id}:pending:${Date.now()}`, {
        path: '/',
        maxAge: 60 * 60 * 12,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
      });
    }

    return needsOnboarding;
  };

  if (!user && isProtected) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/login';
    redirectUrl.searchParams.set('redirectedFrom', pathname);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    applyCookies(res, redirectResponse);
    return redirectResponse;
  }

  if (user && isAuthRoute) {
    const redirectUrl = req.nextUrl.clone();
    redirectUrl.pathname = '/role-select';
    redirectUrl.searchParams.delete('redirectedFrom');
    const redirectResponse = NextResponse.redirect(redirectUrl);
    applyCookies(res, redirectResponse);
    return redirectResponse;
  }

  // An ALLOWLIST of one route — `/matches` — and the list lives in
  // `@/lib/onboarding/destination`, not inline here. See that file's header for why
  // this stopped being "everything except a few exemptions": the old shape locked
  // new students out of the dashboard, search, scholarships and the toolbox, none
  // of which need a profile, and it could produce an inescapable redirect loop.
  //
  // The invariant is now structural rather than remembered. Every destination this
  // block can send someone to — the wizard, a portal home, wherever they were
  // headed — is outside a one-entry allowlist by default, so the target cannot be
  // re-gated and the loop has nowhere to form.
  if (user && isOnboardingGated(pathname)) {
    // Skip the onboarding check on the very first request after OAuth callback —
    // the session cookie has just been written and downstream DB reads can race.
    // Let the page render; the next request will hit the onboarding check normally.
    const isFreshAuth = req.nextUrl.searchParams.get('auth_fresh') === '1';
    if (!isFreshAuth) {
      const needsOnboarding = await getOnboardingStatus(res);
      if (needsOnboarding) {
        // `/welcome`, not `/profile/wizard`. Middleware deliberately does NOT
        // decide whether this user has already seen the welcome screen: that
        // answer lives in `profiles.onboarding`, and reading it here would add a
        // fifth query to the hot path of every protected navigation. `/welcome`
        // is a server component that reads it once and forwards a returning
        // user straight to the wizard — so the cost is paid only by users who
        // are actually mid-setup, and only as one extra redirect.
        //
        // `?from=` preserves where they were headed so the flow can return them
        // there instead of dumping everyone on /dashboard. It carries the SEARCH
        // string too — a student deep-linked to `/course/123?tab=fees` was
        // otherwise returned to `/course/123` with the tab silently dropped.
        // `search` is cleared first so the incoming query cannot leak into
        // /welcome's own params, then `from` is set as a single encoded value.
        const redirectUrl = req.nextUrl.clone();
        const target = `${pathname}${req.nextUrl.search}`;
        redirectUrl.pathname = '/welcome';
        redirectUrl.search = '';
        redirectUrl.searchParams.set('from', target);
        const redirectResponse = NextResponse.redirect(redirectUrl);
        applyCookies(res, redirectResponse);
        return redirectResponse;
      }
    }
  }

  return res;
}

export const config = {
  matcher: [
    '/(dashboard|profile|welcome|matches|applications|admin|university-search|course|shortlist|scholarships|counsellor|parent|role-select|inbox|assistant|toolbox|appointment)(.*)',
    '/login',
    '/signup',
    // Every API route runs through the fail-closed check at the top of
    // `middleware`. Without this entry the matcher covered page prefixes only,
    // so no API request ever reached middleware and each handler's own
    // `getUser()` call was the single point of failure.
    '/api/:path*'
  ]
};
