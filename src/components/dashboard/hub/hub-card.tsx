import Link from 'next/link';
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HubCardProps {
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  /**
   * Tint classes for the icon swatch. LEAVE THIS UNSET unless the card's tone
   * carries meaning — the default brand tint is the right answer for almost
   * every cell.
   *
   * It was set on most of them once (deadlines amber, tasks emerald, pipeline
   * sky) and that is what made the dashboard read as a colour chart: the header
   * hue was fixed per card, so it described the card's POSITION, not its state,
   * while the rows inside each card were already colouring themselves by real
   * urgency. Two colour languages, one of them noise, and the noisy one wrapped
   * the signal.
   *
   * The surviving exception is `feature` on counsellor-authored cards, which is
   * a documented semantic (see globals.css: feature = counsellor-flavoured).
   */
  iconClassName?: string;
  action?: { label: string; href: string };
  children: ReactNode;
  className?: string;
}

/**
 * Shared shell for the dashboard hub cells — consistent header (icon swatch,
 * eyebrow, title, optional deep link) around varying content. Server-safe.
 */
export function HubCard({ eyebrow, title, icon: Icon, iconClassName, action, children, className }: HubCardProps) {
  return (
    <section className={cn('surface-card flex h-full flex-col !p-5 sm:!p-6', className)}>
      <div className="relative z-10 flex h-full flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1',
                iconClassName ?? 'bg-primary/10 text-primary-ink ring-primary/15'
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="eyebrow truncate">{eyebrow}</p>
              <h2 className="text-base font-semibold leading-snug text-foreground">{title}</h2>
            </div>
          </div>
          {action ? (
            <Link
              href={action.href}
              className="group inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {action.label}
              <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ) : null}
        </div>
        <div className="flex-1">{children}</div>
      </div>
    </section>
  );
}
