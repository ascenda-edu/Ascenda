import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHero } from '@/components/layout/page-hero';
import { AnimatedSection, AnimatedGrid, AnimatedGridItem } from '@/components/layout/animated-section';
import { AscendiCoachMount } from '@/components/onboarding/ascendi-coach-mount';
import { ArrowRight } from 'lucide-react';
import {
  DEMO_BUILDING_BLOCKS,
  DEMO_ESSAY_PROMPTS,
  DEMO_UNIVERSITY_CHANCES,
  DEMO_REQUIREMENTS,
  DEMO_TIMELINE_DEADLINES,
} from '@/lib/data/student-demo-data';
import { ToolboxProgressRing, ToolboxCountdown } from '@/components/toolbox/toolbox-landing-widgets';
import { TOOL_VISUAL, type ToolboxTool } from '@/lib/theme/categories';
import { cn } from '@/lib/utils';
import { daysUntil, parseLocalDate } from '@/lib/utils/dates';

export const metadata: Metadata = { title: 'Toolbox' };

const avgProgress = DEMO_REQUIREMENTS.length ? Math.round(DEMO_REQUIREMENTS.reduce((sum, r) => sum + r.progress, 0) / DEMO_REQUIREMENTS.length) : 0;
const upcoming14 = DEMO_TIMELINE_DEADLINES.filter((d) => {
  const diff = daysUntil(d.date);
  return diff >= 0 && diff <= 14;
}).length;
const upcoming30 = DEMO_TIMELINE_DEADLINES.filter((d) => {
  const diff = daysUntil(d.date);
  return diff >= 0 && diff <= 30;
}).length;

const reachCount = DEMO_UNIVERSITY_CHANCES.filter((u) => (39 - u.minimumScore) < 1).length;
const safetyCount = DEMO_UNIVERSITY_CHANCES.filter((u) => (39 - u.minimumScore) >= 5).length;

type ToolCard = {
  title: string;
  href: string;
  tool: ToolboxTool;
  description: string;
  step: number;
  stats: { label: string; value: string | number }[];
};

const TOOL_CARDS: ToolCard[] = [
  {
    title: 'Requirements Checker',
    href: '/toolbox/requirements',
    tool: 'requirements',
    description: "Interactive status toggles and progress rings for each university's requirements.",
    step: 1,
    stats: [
      { label: 'Universities', value: DEMO_REQUIREMENTS.length },
      { label: 'Readiness', value: `${avgProgress}%` },
      { label: 'Complete', value: DEMO_REQUIREMENTS.filter((r) => r.progress === 100).length }
    ]
  },
  {
    title: 'Chances Calculator',
    href: '/toolbox/chances',
    tool: 'chances',
    description: 'Visual probability gauges and what-if score slider for each university.',
    step: 2,
    stats: [
      { label: 'Universities', value: DEMO_UNIVERSITY_CHANCES.length },
      { label: 'Reach', value: reachCount },
      { label: 'Safety', value: safetyCount }
    ]
  },
  {
    title: 'Essay Workshop',
    href: '/toolbox/essay-workshop',
    tool: 'essay',
    description: 'Rich text editor with building blocks, platform-specific limits, and AI writing tips.',
    step: 3,
    stats: [
      { label: 'Blocks', value: DEMO_BUILDING_BLOCKS.length },
      { label: 'Prompts', value: DEMO_ESSAY_PROMPTS.length },
      { label: 'Platforms', value: 4 }
    ]
  },
  {
    title: 'Deadline Timeline',
    href: '/toolbox/timeline',
    tool: 'timeline',
    description: 'Calendar and timeline views with urgency indicators and filtering.',
    step: 4,
    stats: [
      { label: 'Next 14d', value: upcoming14 },
      { label: 'Next 30d', value: upcoming30 },
      { label: 'Total', value: DEMO_TIMELINE_DEADLINES.length }
    ]
  }
];

export default async function ToolboxPage() {
  // Next action: nearest deadline
  const nextDeadline = DEMO_TIMELINE_DEADLINES
    .filter((d) => daysUntil(d.date) >= 0)
    .sort((a, b) => parseLocalDate(a.date).getTime() - parseLocalDate(b.date).getTime())[0];

  const daysUntilNext = nextDeadline ? daysUntil(nextDeadline.date) : null;

  return (
    <>
      <PageHero
        tone="student"
        eyebrow="Toolbox"
        title="Tools to make this easier"
        description="Plan timelines, draft essays, check requirements, see your odds — four ways to take the stress out of applying."
        stats={[
          { label: 'Tools', value: '4', detail: 'Available' },
          { label: 'Readiness', value: `${avgProgress}%`, detail: 'Overall' },
          { label: 'Upcoming', value: String(upcoming14), detail: 'Next 14 days' },
        ]}
      />

      {/* Next action + overall progress */}
      <AnimatedSection>
        <div className="grid gap-4 sm:grid-cols-[1fr,auto]">
          {/* Next action card */}
          {nextDeadline && (
            <Link href="/toolbox/timeline" className="block surface-card hover-lift border-l-4 border-l-primary hover:border-l-primary group overflow-hidden">
              <div className="pointer-events-none absolute -top-6 -right-6 h-24 w-24 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
              <div className="relative z-10 flex items-center gap-4">
                <ToolboxCountdown days={daysUntilNext ?? 0} />
                <div className="flex-1 min-w-0">
                  <p className="eyebrow-accent flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary motion-safe:animate-pulse" />
                    Your next action
                  </p>
                  <h2 className="text-lg font-semibold text-foreground mt-0.5 truncate">{nextDeadline.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {nextDeadline.university} — {daysUntilNext !== null && daysUntilNext <= 7
                      ? <span className="text-danger font-semibold">{daysUntilNext === 0 ? 'Today' : daysUntilNext === 1 ? 'Tomorrow' : `${daysUntilNext} days left`}</span>
                      : parseLocalDate(nextDeadline.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    }
                  </p>
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground/30 group-hover:text-primary-ink group-hover:translate-x-1 transition-[color,transform] shrink-0" />
              </div>
            </Link>
          )}

          {/* Requirements progress ring */}
          <div className="surface-card flex items-center gap-4 sm:min-w-[200px]">
            <div className="relative z-10 flex items-center gap-4 w-full">
              <ToolboxProgressRing value={avgProgress} />
              <div>
                <p className="text-sm font-semibold text-foreground">Requirements</p>
                <p className="text-xs text-muted-foreground">{DEMO_REQUIREMENTS.filter((r) => r.progress === 100).length} of {DEMO_REQUIREMENTS.length} ready</p>
              </div>
            </div>
          </div>
        </div>
      </AnimatedSection>

      {/* Tool cards grid */}
      <AnimatedGrid data-tour="toolbox-tools" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {TOOL_CARDS.map((tool) => {
          const visual = TOOL_VISUAL[tool.tool];
          const Icon = visual.icon;
          return (
            <AnimatedGridItem key={tool.href}>
              <Link
                href={tool.href}
                className={cn(
                  'surface-card hover-lift group relative flex h-full flex-col overflow-hidden border-l-4',
                  visual.border,
                  visual.accent
                )}
              >
                <div className="relative z-10 flex flex-1 flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <div className={cn(visual.swatch, 'h-12 w-12 shadow-e-1')}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <span className="absolute -top-1.5 -left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-label font-bold text-background shadow-e-1">
                        {tool.step}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-base font-semibold text-foreground">{tool.title}</h2>
                        <ArrowRight className={cn('h-3.5 w-3.5 opacity-0 transition-[transform,opacity] group-hover:translate-x-1 group-hover:opacity-100', visual.text)} />
                      </div>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{tool.description}</p>
                    </div>
                  </div>

                  <div className="mt-auto grid grid-cols-3 gap-2">
                    {tool.stats.map((stat) => (
                      <div key={stat.label} className="surface-subcard rounded-xl px-2.5 py-2.5 text-center">
                        <p className="text-sm font-bold text-foreground tabular-nums">{stat.value}</p>
                        <p className="mt-0.5 text-label text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Link>
            </AnimatedGridItem>
          );
        })}
      </AnimatedGrid>
      <AscendiCoachMount />
    </>
  );
}
