'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { GraduationCap, Briefcase, ArrowRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/hooks/useSupabase';

const ROLES = [
  {
    id: 'student',
    label: 'Student',
    description: 'Track applications, explore universities, and manage your admissions journey.',
    icon: GraduationCap,
    accent: 'info',
    href: '/dashboard',
    badge: 'Applicant workspace',
    badgeColor: 'bg-info-subtle text-info'
  },
  {
    id: 'counsellor',
    label: 'Counsellor',
    description: 'Monitor your cohort, track student progress, and manage deadlines at scale.',
    icon: Briefcase,
    accent: 'feature',
    href: '/counsellor',
    badge: 'Professional dashboard',
    badgeColor: 'bg-feature-subtle text-feature'
  }
] as const;

type RoleId = (typeof ROLES)[number]['id'];

export default function RoleSelectPage() {
  const router = useRouter();
  const supabase = useSupabase();
  const [selected, setSelected] = useState<RoleId | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  // Set once auth resolves (either path). The 8s safety timeout checks this
  // before redirecting so a slow-but-successful check can't dump a signed-in
  // user at /login.
  const authResolvedRef = useRef(false);

  // Pre-warm both destination routes while the user reads the role cards.
  // This sidesteps the cold serverless first-request penalty for the
  // demo's opening moments — by the time you click, the chunk is cached.
  useEffect(() => {
    router.prefetch('/dashboard');
    router.prefetch('/counsellor');
  }, [router]);

  useEffect(() => {
    let isMounted = true;

    const resolveAuth = () => {
      authResolvedRef.current = true;
      if (isMounted) setCheckingAuth(false);
      clearTimeout(timeout);
    };

    // Safety timeout: if verification takes > 8s, stop blocking on it and show
    // the role cards.
    //
    // It used to `router.replace('/login')` here, and that could only ever be
    // wrong. `/role-select` is in PROTECTED_PREFIXES — middleware has already
    // established a server-side session before this component mounts, so the
    // only thing a timeout proves is that the *client's* `getUser()` round trip
    // to Supabase was slow. Sending that user to /login bounced them straight
    // back here (middleware redirects a signed-in visitor off /login), so a
    // slow network turned into a ping-pong that reads as "the login page keeps
    // reloading" — from a session that was valid the whole time.
    //
    // Rendering the cards is safe: neither is a capability. Clicking one is a
    // navigation to /dashboard or /counsellor, and middleware is the thing that
    // decides whether that request is allowed.
    const timeout = setTimeout(() => {
      if (isMounted && !authResolvedRef.current) {
        console.warn('RoleSelect: Auth verification timed out; deferring to middleware');
        resolveAuth();
      }
    }, 8000);

    // Listen for auth state changes — catches the session that arrives
    // after an OAuth redirect even if getSession() misses it initially
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (session) {
        resolveAuth();
      }
    });

    const performCheck = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (isMounted && !error && user) {
          resolveAuth();
        }
        // Otherwise don't redirect immediately — give onAuthStateChange a
        // chance to pick up the session from cookies (the safety timeout is
        // the backstop).
      } catch (err) {
        console.error('RoleSelect: Verification error', err);
      }
    };

    // `performCheck` logs and swallows its own errors; this terminal `.catch`
    // is the backstop for anything it missed. Nothing user-visible to do here —
    // if auth never resolves, the 8s safety timeout above moves the user on to
    // /login, which is the correct destination for an unverifiable session.
    performCheck().catch((err: unknown) => {
      console.error('RoleSelect: Verification error', err);
    });

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router, supabase]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="relative mx-auto h-2 w-48 overflow-hidden rounded-full bg-muted/60">
            <div className="absolute inset-0 translate-x-[-100%] motion-safe:animate-shimmer bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          </div>
          <p className="text-sm text-muted-foreground motion-safe:animate-pulse">Verifying session…</p>
        </div>
      </div>
    );
  }

  const handleSelect = (role: (typeof ROLES)[number]) => {
    if (loading) return;
    setSelected(role.id);
    setLoading(true);
    sessionStorage.setItem('ascenda-session-role', role.id);
    router.push(role.href);
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-10 text-center"
      >
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium shadow-e-1 backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-success-fill" aria-hidden />
          Welcome to Ascenda
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
          How are you using Ascenda today?
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:text-base">
          Choose your role to get the right experience.
        </p>
      </motion.div>

      <div className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        {ROLES.map((role, i) => {
          const Icon = role.icon;
          const isSelected = selected === role.id;
          const isOther = selected !== null && selected !== role.id;

          return (
            <motion.button
              key={role.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
              onClick={() => handleSelect(role)}
              disabled={loading}
              className={cn(
                'group relative flex flex-col items-start gap-4 rounded-2xl border bg-card/80 p-6 text-left shadow-e-1 backdrop-blur',
                'hover-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                role.accent === 'feature'
                  ? 'hover:border-feature/60 hover:ring-1 hover:ring-feature/20'
                  : 'hover:border-info/60 hover:ring-1 hover:ring-info/20',
                isSelected && role.accent === 'feature' && 'border-feature/60 ring-1 ring-feature/30',
                isSelected && role.accent === 'info' && 'border-info/60 ring-1 ring-info/30',
                isOther && 'opacity-40'
              )}
            >
              <div
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-2xl',
                  role.accent === 'feature' ? 'bg-feature-subtle text-feature' : 'bg-info-subtle text-info'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>

              <div className="flex-1 space-y-1">
                <span className={cn('inline-block rounded-full px-2 py-0.5 text-label font-semibold uppercase tracking-widest', role.badgeColor)}>
                  {role.badge}
                </span>
                <p className="text-lg font-semibold leading-tight text-foreground">{role.label}</p>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>

              <span
                className={cn(
                  'flex items-center gap-1 text-sm font-medium transition-colors',
                  role.accent === 'feature' ? 'text-feature' : 'text-info'
                )}
              >
                {isSelected && loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Opening…
                  </>
                ) : (
                  <>
                    Continue
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  </>
                )}
              </span>
            </motion.button>
          );
        })}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-8 text-xs text-muted-foreground"
      >
        You can switch roles by signing out and back in.
      </motion.p>
    </div>
  );
}
