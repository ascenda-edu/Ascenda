import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { Database } from '@/lib/types/database';
import { isProfileComplete } from '@/lib/profile/completion';

const PROTECTED_PREFIXES = [
  '/dashboard',
  '/profile',
  '/matches',
  '/applications',
  '/admin',
  '/university-search',
  '/course',
  '/shortlist',
  '/scholarships',
  '/counsellor',
  '/role-select',
  '/inbox'
];

export async function middleware(req: NextRequest) {
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

    const statusCookie = req.cookies.get('onboarding_status')?.value;
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

    const [personalResponse, academicResponse, lifestyleResponse, subjectsResponse] = await Promise.all([
      supabase.from('student_personal_information').select('first_name,last_name,email,nationality,resident_country').eq('profile_id', user.id).maybeSingle(),
      supabase.from('student_academic_input').select('programme_type,school_name,school_country,graduation_year,intended_clusters,english_required').eq('profile_id', user.id).maybeSingle(),
      supabase.from('student_lifestyle_preference').select('extracurricular_interests').eq('profile_id', user.id).maybeSingle(),
      supabase.from('student_subjects').select('id', { count: 'exact', head: true }).eq('profile_id', user.id)
    ]);

    const completionRecords = {
      personal: personalResponse.data,
      academicInput: academicResponse.data,
      subjectCount: subjectsResponse.count ?? 0,
      lifestyle: lifestyleResponse.data
    };

    const needsOnboarding = !isProfileComplete(completionRecords);

    if (!needsOnboarding) {
      response.cookies.set('onboarding_complete', user.id, {
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
      });
      response.cookies.set('onboarding_status', `${user.id}:complete:${Date.now()}`, {
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
      });
    } else {
      response.cookies.set('onboarding_status', `${user.id}:pending:${Date.now()}`, {
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

  if (user && isProtected && !pathname.startsWith('/profile') && !pathname.startsWith('/counsellor') && !pathname.startsWith('/role-select')) {
    // Skip the onboarding check on the very first request after OAuth callback —
    // the session cookie has just been written and downstream DB reads can race.
    // Let the page render; the next request will hit the onboarding check normally.
    const isFreshAuth = req.nextUrl.searchParams.get('auth_fresh') === '1';
    if (!isFreshAuth) {
      const needsOnboarding = await getOnboardingStatus(res);
      if (needsOnboarding) {
        const redirectUrl = req.nextUrl.clone();
        redirectUrl.pathname = '/profile/wizard';
        redirectUrl.searchParams.set('onboarding', 'true');
        const redirectResponse = NextResponse.redirect(redirectUrl);
        applyCookies(res, redirectResponse);
        return redirectResponse;
      }
    }
  }

  return res;
}

export const config = {
  matcher: ['/(dashboard|profile|matches|applications|admin|university-search|course|shortlist|scholarships|counsellor|role-select|inbox)(.*)', '/login', '/signup']
};
