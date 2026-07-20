'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Award, Heart, Search, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stagger, childFade } from '@/lib/motion';
import { useShortlist } from '@/components/university-search/shortlist-store';

interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  iconClassName: string;
  count?: number | null;
}

/**
 * Bottom launch strip — one tile per section of the app that isn't already a
 * hub cell, with live counts where the data exists (shortlist is
 * localStorage-synced, so this stays a client island).
 */
export function QuickLinks() {
  const reduced = useReducedMotion();
  const { items: shortlistItems, ready: shortlistReady } = useShortlist();

  const links: QuickLink[] = [
    {
      href: '/university-search/search',
      label: 'Explore universities',
      description: 'Search 119k+ programmes worldwide',
      icon: Search,
      iconClassName: 'bg-sky-500/10 text-sky-600 ring-sky-500/15 dark:text-sky-300'
    },
    {
      href: '/shortlist',
      label: 'Shortlist',
      description: 'Programmes you have saved',
      icon: Heart,
      iconClassName: 'bg-rose-500/10 text-rose-600 ring-rose-500/15 dark:text-rose-300',
      count: shortlistReady ? shortlistItems.length : null
    },
    {
      href: '/scholarships',
      label: 'Scholarships',
      description: 'Funding that fits your profile',
      icon: Award,
      iconClassName: 'bg-amber-500/10 text-amber-700 ring-amber-500/15 dark:text-amber-300'
    },
    {
      href: '/toolbox',
      label: 'Toolbox',
      description: 'Essay workshop & practice tools',
      icon: Sparkles,
      iconClassName: 'bg-violet-500/10 text-violet-600 ring-violet-500/15 dark:text-violet-300'
    }
  ];

  const Wrapper = reduced ? 'div' : motion.div;
  const Item = reduced ? 'div' : motion.div;

  return (
    <Wrapper
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      {...(reduced
        ? {}
        : {
            variants: stagger,
            initial: 'hidden',
            whileInView: 'show',
            viewport: { once: true, margin: '-40px' }
          })}
    >
      {links.map((link) => {
        const Icon = link.icon;
        return (
          <Item key={link.href} {...(reduced ? {} : { variants: childFade })}>
            <Link
              href={link.href}
              className="group flex h-full items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-white/10"
            >
              <div
                className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform group-hover:scale-105',
                  link.iconClassName
                )}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{link.label}</p>
                  {typeof link.count === 'number' ? (
                    <span className="rounded-full bg-muted px-1.5 py-px text-[0.625rem] font-bold tabular-nums text-muted-foreground">
                      {link.count}
                    </span>
                  ) : null}
                </div>
                <p className="truncate text-xs text-muted-foreground">{link.description}</p>
              </div>
            </Link>
          </Item>
        );
      })}
    </Wrapper>
  );
}
