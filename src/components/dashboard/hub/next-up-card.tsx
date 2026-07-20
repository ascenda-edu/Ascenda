import Link from 'next/link';
import { ArrowRight, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HubCard } from './hub-card';

export type HubFocusTone = 'rose' | 'amber' | 'emerald' | 'sky' | 'violet' | 'primary';

export interface HubFocusItem {
  id: string;
  /** Short category chip, e.g. 'Due today', 'Inbox', 'Deadline'. */
  label: string;
  title: string;
  detail: string;
  href: string;
  tone: HubFocusTone;
}

const TONE = {
  rose: {
    chip: 'bg-rose-500/10 text-rose-600 dark:text-rose-300',
    heroBg: 'border-rose-300/50 bg-rose-500/[0.04]',
    accent: 'border-l-rose-400',
    dot: 'bg-rose-500'
  },
  amber: {
    chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    heroBg: 'border-amber-300/50 bg-amber-500/[0.04]',
    accent: 'border-l-amber-400',
    dot: 'bg-amber-500'
  },
  emerald: {
    chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    heroBg: 'border-emerald-300/50 bg-emerald-500/[0.04]',
    accent: 'border-l-emerald-400',
    dot: 'bg-emerald-500'
  },
  sky: {
    chip: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
    heroBg: 'border-sky-300/50 bg-sky-500/[0.04]',
    accent: 'border-l-sky-400',
    dot: 'bg-sky-500'
  },
  violet: {
    chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
    heroBg: 'border-violet-300/50 bg-violet-500/[0.04]',
    accent: 'border-l-violet-400',
    dot: 'bg-violet-500'
  },
  primary: {
    chip: 'bg-primary/10 text-primary',
    heroBg: 'border-primary/30 bg-primary/[0.04]',
    accent: 'border-l-primary/60',
    dot: 'bg-primary'
  }
} satisfies Record<HubFocusTone, { chip: string; heroBg: string; accent: string; dot: string }>;

/**
 * The dashboard's priority spine: one hero "do this next" action followed by
 * a short numbered queue. Every row deep-links to the page where the work
 * actually happens.
 */
export function NextUpCard({ items }: { items: HubFocusItem[] }) {
  const [hero, ...rest] = items;

  return (
    <HubCard eyebrow="Up next" title="Your next moves" icon={Compass}>
      <div className="flex h-full flex-col gap-4">
        {hero ? (
          <Link
            href={hero.href}
            className={cn(
              'group flex items-center gap-4 rounded-2xl border border-l-4 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5',
              TONE[hero.tone].heroBg,
              TONE[hero.tone].accent,
              // A lone action fills the cell instead of leaving dead space.
              rest.length === 0 && 'flex-1'
            )}
          >
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[0.6875rem] font-semibold',
                  TONE[hero.tone].chip
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', TONE[hero.tone].dot)} aria-hidden />
                {hero.label}
              </span>
              <p className="mt-2 text-lg font-semibold leading-snug text-foreground sm:text-xl">{hero.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{hero.detail}</p>
            </div>
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition-transform group-hover:translate-x-1"
              aria-hidden
            >
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        ) : null}

        {rest.length > 0 ? (
          <ol className="space-y-2">
            {rest.map((item, index) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3 transition-all hover:-translate-y-px hover:border-primary/20 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-[0.6875rem] font-bold text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    {index + 2}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className={cn('rounded-full px-2 py-px text-[0.625rem] font-semibold', TONE[item.tone].chip)}>
                        {item.label}
                      </span>
                      <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-all group-hover:translate-x-0.5 group-hover:text-primary/60"
                    aria-hidden
                  />
                </Link>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </HubCard>
  );
}
