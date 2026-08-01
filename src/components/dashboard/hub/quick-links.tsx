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
      iconClassName: 'bg-info-subtle text-info ring-info/25'
    },
    {
      href: '/shortlist',
      label: 'Shortlist',
      description: 'Programmes you have saved',
      icon: Heart,
      iconClassName: 'bg-danger-subtle text-danger ring-danger/25',
      count: shortlistReady ? shortlistItems.length : null
    },
    {
      href: '/scholarships',
      label: 'Scholarships',
      description: 'Funding that fits your profile',
      icon: Award,
      iconClassName: 'bg-warning-subtle text-warning ring-warning/25'
    },
    {
      href: '/toolbox',
      label: 'Toolbox',
      description: 'Essay workshop & practice tools',
      icon: Sparkles,
      iconClassName: 'bg-feature-subtle text-feature ring-feature/25'
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
              className="surface-card hover-lift group flex h-full items-center gap-3 !p-4 hover:border-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    <span className="rounded-full bg-muted px-1.5 py-px text-label font-bold tabular-nums text-muted-foreground">
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
