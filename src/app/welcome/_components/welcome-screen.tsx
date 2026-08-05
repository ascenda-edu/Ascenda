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
  Telescope,
  Users,
  CalendarClock,
  ShieldCheck
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AnimatedBlobBanner } from '@/components/animated-blob-banner';
import { markOnboardingStep } from '@/lib/onboarding/actions';
import { BROWSE_FIRST } from '@/lib/onboarding/destination';
import { cn } from '@/lib/utils';

interface ValueProp {
  icon: LucideIcon;
  title: string;
  body: string;
}

const STUDENT_VALUE: ValueProp[] = [
  {
    icon: Target,
    title: 'Matches, not a search box',
    body: 'We score 119,000 programmes against your grades, subjects and budget, then rank the ones you can realistically get into.'
  },
  {
    icon: CalendarClock,
    title: 'Every deadline in one place',
    body: 'Applications, tasks and documents track themselves once a programme is on your list. Nothing lives in a spreadsheet.'
  },
  {
    icon: Users,
    title: 'A counsellor who can see your work',
    body: 'Ask for help from any page. Your counsellor gets the context with it, so you never re-explain where you are.'
  }
];

const COUNSELLOR_VALUE: ValueProp[] = [
  {
    icon: Compass,
    title: 'Your whole cohort, ranked',
    body: 'Students sorted by what needs you today — stalled applications, missed deadlines, unanswered questions.'
  },
  {
    icon: ClipboardList,
    title: 'Help requests with context',
    body: 'Every question arrives attached to the student, the programme and the stage they are stuck on.'
  },
  {
    icon: CalendarClock,
    title: 'Deadlines across everyone',
    body: 'One timeline for the whole roster, so a cohort-wide crunch is visible before it becomes one.'
  }
];

/**
 * One swatch for every value prop, and it carries no fill at all. These started
 * as info / success / feature — a three-hue rotation over three sales points,
 * which is decoration, not status: nothing on this screen has succeeded or is
 * pending. Collapsing them to a single brand tint still spent colour on a
 * category, so the glyph now stands on its own. The icon differentiates.
 */
const VALUE_SWATCH = 'text-muted-foreground';

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

  /**
   * One navigation path for both buttons, differing only in destination.
   *
   * Both stamp `welcomed_at` — including "browse first". A student who has read
   * this screen has seen it, whichever button they pressed, and leaving the
   * breadcrumb unstamped would re-show it on their next gated navigation, which
   * reads as the app not having registered the choice they just made.
   */
  const goTo = (target: string) => {
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
      router.push(target);
    });
  };

  const handleContinue = () => goTo(returnTo);
  // BROWSE_FIRST, never a literal — it has to stay out of the gated list it is an
  // escape from. See lib/onboarding/destination.ts.
  const handleBrowseFirst = () => goTo(BROWSE_FIRST);

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
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-foreground shadow-e-1 backdrop-blur">
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
                <div className={cn('flex h-11 w-11 items-center justify-center rounded-2xl', VALUE_SWATCH)}>
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <p className="mt-4 font-heading text-base font-semibold leading-tight text-foreground">{value.title}</p>
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
          {/* The escape hatch. Students only — a counsellor has no setup wall to
              get around, and the catalogue is not their surface.

              Deliberately a real second action and not a footnote: the whole point
              is that someone unwilling to hand over six subject grades sight-unseen
              can go and look at the product first. Ranking still needs the profile,
              so this is phrased as what it is — the catalogue without the scoring —
              rather than implying setup is optional. */}
          {isStudent ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBrowseFirst}
              disabled={busy}
              className="gap-2 text-muted-foreground"
            >
              <Telescope className="h-4 w-4" aria-hidden />
              Browse universities first
            </Button>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {isStudent
              ? 'Ranking needs the first three steps. Browsing does not — you can look around before you fill anything in.'
              : 'You can revisit this from the help menu at any time.'}
          </p>
        </motion.div>
      </div>

      <AnimatedBlobBanner className="opacity-60 -z-raised" variant="cool" />
    </div>
  );
}
