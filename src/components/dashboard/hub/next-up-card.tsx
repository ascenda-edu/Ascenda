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

// Legacy tone names kept as the public HubFocusTone union (the dashboard passes
// them by name); each maps onto the semantic tone token, so no `dark:` variants
// are needed — the token flips itself. See lib/theme/categories.ts.
const TONE = {
  rose: {
    chip: 'bg-danger-subtle text-danger',
    heroBg: 'border-danger/25 bg-danger/3',
    accent: 'border-l-danger',
    dot: 'bg-danger-fill'
  },
  amber: {
    chip: 'bg-warning-subtle text-warning',
    heroBg: 'border-warning/25 bg-warning/3',
    accent: 'border-l-warning',
    dot: 'bg-warning-fill'
  },
  emerald: {
    chip: 'bg-success-subtle text-success',
    heroBg: 'border-success/25 bg-success/3',
    accent: 'border-l-success',
    dot: 'bg-success-fill'
  },
  sky: {
    chip: 'bg-info-subtle text-info',
    heroBg: 'border-info/25 bg-info/3',
    accent: 'border-l-info',
    dot: 'bg-info-fill'
  },
  violet: {
    chip: 'bg-feature-subtle text-feature',
    heroBg: 'border-feature/25 bg-feature/3',
    accent: 'border-l-feature',
    dot: 'bg-feature-fill'
  },
  primary: {
    chip: 'bg-primary/10 text-primary-ink',
    heroBg: 'border-primary/30 bg-primary/3',
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
              'hover-lift group flex items-center gap-4 rounded-2xl border border-l-4 p-4 shadow-e-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5',
              TONE[hero.tone].heroBg,
              TONE[hero.tone].accent,
              // A lone action fills the cell instead of leaving dead space.
              rest.length === 0 && 'flex-1'
            )}
          >
            <div className="min-w-0 flex-1">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-label font-semibold',
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
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-e-1 transition-transform group-hover:translate-x-1"
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
                  className="hover-lift group flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3 hover:border-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-label font-bold text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary-ink">
                    {index + 2}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className={cn('rounded-full px-2 py-px text-label font-semibold', TONE[item.tone].chip)}>
                        {item.label}
                      </span>
                      <p className="truncate text-sm font-semibold text-foreground">{item.title}</p>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary-ink/60"
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
