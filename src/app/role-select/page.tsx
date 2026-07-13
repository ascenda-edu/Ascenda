'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { GraduationCap, Briefcase, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/hooks/useSupabase';

const ROLES = [
  {
    id: 'student',
    label: 'Student',
    description: 'Track applications, explore universities, and manage your admissions journey.',
    icon: GraduationCap,
    accent: 'sky',
    href: '/dashboard',
    badge: 'Applicant workspace',
    badgeColor: 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
  },
  {
    id: 'counsellor',
    label: 'Counsellor',
    description: 'Monitor your cohort, track student progress, and manage deadlines at scale.',
    icon: Briefcase,
    accent: 'violet',
    href: '/counsellor',
    badge: 'Professional dashboard',
    badgeColor: 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
  }
] as const;

type RoleId = (typeof ROLES)[number]['id'];

export default function RoleSelectPage() {
  const router = useRouter();
  const supabase = useSupabase();
  const [selected, setSelected] = useState<RoleId | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Pre-warm both destination routes while the user reads the role cards.
  // This sidesteps the cold serverless first-request penalty for the
  // demo's opening moments — by the time you click, the chunk is cached.
  useEffect(() => {
    router.prefetch('/dashboard');
    router.prefetch('/counsellor');
  }, [router]);

  useEffect(() => {
    let isMounted = true;

    // Safety timeout: if verification takes > 8s, redirect to login
    const timeout = setTimeout(() => {
      if (isMounted && checkingAuth) {
        console.warn('RoleSelect: Auth verification timed out');
        router.replace('/login');
      }
    }, 8000);

    // Listen for auth state changes — catches the session that arrives
    // after an OAuth redirect even if getSession() misses it initially
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if (session) {
        setCheckingAuth(false);
        clearTimeout(timeout);
      }
    });

    const performCheck = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (isMounted) {
          if (error || !user) {
            // Don't redirect immediately — give onAuthStateChange a chance
            // to pick up the session from cookies
          } else {
            setCheckingAuth(false);
            clearTimeout(timeout);
          }
        }
      } catch (err) {
        console.error('RoleSelect: Verification error', err);
      }
    };

    performCheck();

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [router, supabase, checkingAuth]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="space-y-3 text-center">
          <div className="relative mx-auto h-2 w-48 overflow-hidden rounded-full bg-muted/60">
            <div className="absolute inset-0 translate-x-[-100%] animate-shimmer bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
          </div>
          <p className="text-sm text-muted-foreground animate-pulse">Verifying session...</p>
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
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium shadow-sm backdrop-blur">
          <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
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
                'group relative flex flex-col items-start gap-4 rounded-2xl border bg-card/80 p-6 text-left shadow-sm backdrop-blur transition-all duration-200',
                'hover:-translate-y-1 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                role.accent === 'violet'
                  ? 'hover:border-violet-400/60 hover:ring-1 hover:ring-violet-400/20'
                  : 'hover:border-sky-400/60 hover:ring-1 hover:ring-sky-400/20',
                isSelected && role.accent === 'violet' && 'border-violet-400/60 ring-1 ring-violet-400/30',
                isSelected && role.accent === 'sky' && 'border-sky-400/60 ring-1 ring-sky-400/30',
                isOther && 'opacity-40'
              )}
            >
              <div
                className={cn(
                  'flex h-11 w-11 items-center justify-center rounded-2xl',
                  role.accent === 'violet'
                    ? 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
                    : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'
                )}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </div>

              <div className="flex-1 space-y-1">
                <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest', role.badgeColor)}>
                  {role.badge}
                </span>
                <p className="text-lg font-semibold leading-tight text-foreground">{role.label}</p>
                <p className="text-sm text-muted-foreground">{role.description}</p>
              </div>

              <span
                className={cn(
                  'flex items-center gap-1 text-sm font-medium transition-colors',
                  role.accent === 'violet'
                    ? 'text-violet-600 group-hover:text-violet-700 dark:text-violet-400'
                    : 'text-sky-600 group-hover:text-sky-700 dark:text-sky-400'
                )}
              >
                {isSelected && loading ? 'Opening…' : 'Continue'}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
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
