'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  ClipboardList,
  Compass,
  GraduationCap,
  Loader2,
  Sparkles,
  Target,
  Users,
  CalendarClock,
  ShieldCheck
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedBlobBanner } from '@/components/animated-blob-banner';
import { markOnboardingStep } from '@/lib/onboarding/actions';
import { cn } from '@/lib/utils';

interface ValueProp {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Token name, not a palette literal — see the status-token rule in globals.css. */
  tone: 'info' | 'success' | 'feature';
}

const STUDENT_VALUE: ValueProp[] = [
  {
    icon: Target,
    title: 'Matches, not a search box',
    body: 'We score 119,000 programmes against your grades, subjects and budget, then rank the ones you can realistically get into.',
    tone: 'info'
  },
  {
    icon: CalendarClock,
    title: 'Every deadline in one place',
    body: 'Applications, tasks and documents track themselves once a programme is on your list. Nothing lives in a spreadsheet.',
    tone: 'success'
  },
  {
    icon: Users,
    title: 'A counsellor who can see your work',
    body: 'Ask for help from any page. Your counsellor gets the context with it, so you never re-explain where you are.',
    tone: 'feature'
  }
];

const COUNSELLOR_VALUE: ValueProp[] = [
  {
    icon: Compass,
    title: 'Your whole cohort, ranked',
    body: 'Students sorted by what needs you today — stalled applications, missed deadlines, unanswered questions.',
    tone: 'feature'
  },
  {
    icon: ClipboardList,
    title: 'Help requests with context',
    body: 'Every question arrives attached to the student, the programme and the stage they are stuck on.',
    tone: 'info'
  },
  {
    icon: CalendarClock,
    title: 'Deadlines across everyone',
    body: 'One timeline for the whole roster, so a cohort-wide crunch is visible before it becomes one.',
    tone: 'success'
  }
];

const TONE_CLASS: Record<ValueProp['tone'], string> = {
  info: 'bg-info-subtle text-info ring-info/25',
  success: 'bg-success-subtle text-success ring-success/25',
  feature: 'bg-feature-subtle text-feature ring-feature/25'
};

/** What the student is actually agreeing to, stated before they start. */
const SETUP_FACTS = [
  { icon: ClipboardList, label: '3 short steps', detail: 'About 4 minutes' },
  { icon: Sparkles, label: '2 optional extras', detail: 'Sharpen your ranking later' },
  { icon: ShieldCheck, label: 'Saved as you type', detail: 'Stop and come back anytime' }
];

export function WelcomeScreen({
  variant,
  firstName,
  returnTo
}: {
  variant: 'student' | 'counsellor';
  firstName: string | null;
  /** Where "continue" leads — resolved on the server, never built from a URL param here. */
  returnTo: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [navigating, setNavigating] = useState(false);

  const isStudent = variant === 'student';
  const values = isStudent ? STUDENT_VALUE : COUNSELLOR_VALUE;

  const handleContinue = () => {
    if (navigating) return;
    setNavigating(true);

    startTransition(async () => {
      // Stamp first, THEN navigate. If the order were reversed the redirect
      // would race the write, and a lost race means `middleware.ts` sends the
      // user right back here — the welcome screen would reappear on top of the
      // wizard they just opened. Navigation is cheap to delay; this is not.
      //
      // A failed stamp is deliberately NOT fatal: `markOnboardingStep` soft-fails
      // and the worst case is seeing this screen once more. Blocking the user at
      // the front door over a breadcrumb write would be far worse.
      await markOnboardingStep('welcomed_at');
      router.push(returnTo);
    });
  };

  const busy = isPending || navigating;
  const greeting = firstName ? `Welcome, ${firstName}` : 'Welcome to Ascenda';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
      <div className="relative z-raised w-full max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center"
        >
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-xs font-medium text-foreground shadow-e-1 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-success-fill" aria-hidden />
            {isStudent ? 'Your admissions workspace' : 'Your counsellor workspace'}
          </p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{greeting}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
            {isStudent
              ? "Before you start searching — here's what Ascenda does with what you tell it."
              : 'Everything your cohort is doing, in one place. Here is what you get.'}
          </p>
        </motion.div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {values.map((value, index) => {
            const Icon = value.icon;
            return (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + index * 0.08 }}
                className="surface-card surface-card--static rounded-3xl"
              >
                <div
                  className={cn(
                    'flex h-11 w-11 items-center justify-center rounded-2xl ring-1',
                    TONE_CLASS[value.tone]
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <p className="mt-4 text-base font-semibold leading-tight text-foreground">{value.title}</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{value.body}</p>
              </motion.div>
            );
          })}
        </div>

        {isStudent && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.34 }}
            className="surface-toolbar mt-6 rounded-3xl px-5 py-4"
          >
            <p className="text-label font-semibold uppercase tracking-widest text-muted-foreground">
              What setup involves
            </p>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {SETUP_FACTS.map((fact) => {
                const Icon = fact.icon;
                return (
                  <li key={fact.label} className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary-ink" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium text-foreground">{fact.label}</span>
                      <span className="block text-xs text-muted-foreground">{fact.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.42 }}
          className="mt-8 flex flex-col items-center gap-3"
        >
          <Button size="lg" onClick={handleContinue} disabled={busy} className="gap-2 min-w-56">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Opening…
              </>
            ) : (
              <>
                {isStudent ? <GraduationCap className="h-4 w-4" aria-hidden /> : <Compass className="h-4 w-4" aria-hidden />}
                {isStudent ? 'Set up my profile' : 'Open my dashboard'}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            {isStudent
              ? 'You need the first three steps before we can rank anything for you.'
              : 'You can revisit this from the help menu at any time.'}
          </p>
        </motion.div>
      </div>

      <AnimatedBlobBanner className="opacity-60 -z-raised" variant="cool" />
    </div>
  );
}
