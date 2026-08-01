import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Only same-origin, absolute-path destinations may be redirected to.
 *
 * `new URL(next, base)` lets an ABSOLUTE `next` win over the base, so
 * `?next=https://evil.example` (or the protocol-relative `//evil.example`)
 * redirected off-site — carrying the session cookies this route has just set,
 * immediately after login, from a link that looks like a legitimate Ascenda URL.
 *
 * Same rule the SQL side already enforces (20260718130000, `like '/%' and not
 * like '//%'`): must start with a single `/`. Backslashes are rejected too —
 * browsers normalise `/\evil.example` to a protocol-relative URL.
 */
const safeNextPath = (raw: string | null): string => {
  if (!raw || !raw.startsWith('/')) return '/dashboard';
  if (raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard';
  return raw;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const redirectUrl = new URL(next, req.url);
    redirectUrl.searchParams.set('auth_fresh', '1');
    const response = NextResponse.redirect(redirectUrl);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            response.cookies.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            response.cookies.set({ name, value: '', ...options });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return response;
    }

    console.error('Auth callback code exchange failed:', error.message);
  }

  return NextResponse.redirect(new URL('/login', req.url));
}
