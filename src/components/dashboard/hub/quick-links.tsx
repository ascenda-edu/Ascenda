'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { Award, Heart, Search, Sparkles, type LucideIcon } from 'lucide-react';
import { stagger, childFade } from '@/lib/motion';
import { useShortlist } from '@/components/university-search/shortlist-store';

interface QuickLink {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  count?: number | null;
}

/**
 * Bottom launch strip — one tile per section of the app that isn't already a
 * hub cell, with live counts where the data exists (shortlist is
 * localStorage-synced, so this stays a client island).
 *
 * These are NAVIGATION, so every swatch is neutral and the lucide icon carries
 * the identity on its own. Each tile used to pick its own status hue — shortlist
 * was `danger` because a heart is red, scholarships was `warning` because an
 * award is gold — which is icon-literalism, not semantics: it put the overdue
 * colour and the pending colour side by side on a row where nothing is overdue
 * or pending. A single shared brand tint replaced that and was no better: it
 * still spent colour on a destination rather than on a state. Don't reintroduce
 * either.
 */
export function QuickLinks() {
  const reduced = useReducedMotion();
  const { items: shortlistItems, ready: shortlistReady } = useShortlist();

  const links: QuickLink[] = [
    {
      href: '/university-search/search',
      label: 'Explore universities',
      description: 'Search 119k+ programmes worldwide',
      icon: Search
    },
    {
      href: '/shortlist',
      label: 'Shortlist',
      description: 'Programmes you have saved',
      icon: Heart,
      count: shortlistReady ? shortlistItems.length : null
    },
    {
      href: '/scholarships',
      label: 'Scholarships',
      description: 'Funding that fits your profile',
      icon: Award
    },
    {
      href: '/toolbox',
      label: 'Toolbox',
      description: 'Essay workshop & practice tools',
      icon: Sparkles
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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-transform group-hover:scale-105">
                <Icon className="h-[18px] w-[18px]" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">{link.label}</p>
                  {typeof link.count === 'number' ? (
                    <span className="rounded-full bg-primary/10 px-1.5 py-px text-label font-bold tabular-nums text-primary-ink">
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
