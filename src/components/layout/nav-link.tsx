'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { DURATION, EASE } from '@/lib/motion';
import { isNavActive, type NavItem } from './navigation';

interface NavLinkProps {
    item: NavItem;
    mobile?: boolean;
}

/* ─── Shared active indicator ───────────────────────────────────────────────
   The moving fill behind the active pill is one `layoutId` element shared by
   every pill in a row, so switching routes SLIDES it instead of popping a new
   `bg-primary` on and off.

   The ids are module constants rather than `useId` values, which is the one
   place this diverges from <Tabs> / SectionNav. Those own their whole row and
   can mint a scoped id in the parent; the top bar's row is assembled in
   navbar.tsx out of sibling <NavLink>s and <NavDropdown>s with no shared
   ancestor of ours, so a `useId` would be per-PILL — one indicator each, and
   nothing to slide between. A module constant is safe here because the bar is a
   fixed singleton: exactly one of these rows exists per document. If the top
   bar is ever rendered twice at once, this needs a real provider in navbar.tsx.

   Desktop and mobile get SEPARATE ids on purpose. The desktop row is
   `hidden md:flex` — hidden, but still mounted — so a shared id would have
   framer measuring a display:none pill and animating the visible indicator into
   a zero-sized box. */
export const TOP_NAV_INDICATOR = 'ascenda-topnav-indicator';
const MOBILE_INDICATOR = 'ascenda-topnav-indicator-mobile';

// Same curve as the landing nav's pill — see lib/motion.ts. `MotionConfig
// reducedMotion="user"` (providers.tsx) drops the transform when the OS asks for
// less motion, which correctly leaves the indicator snapping between pills
// rather than sliding; no per-component gating needed.
const NAV_INDICATOR_TRANSITION = { duration: DURATION.fast, ease: EASE } as const;

/**
 * The pill shell, shared with NavDropdown so grouped and ungrouped pills read as
 * one row. `relative` is load-bearing: it's what the absolute fill positions
 * against. No hover lift — this is a horizontal bar of pills, and lifting one
 * makes the whole row feel unstable. Colour + background carry hover instead, on
 * an explicit transition property list (the fill is framer's problem now, so
 * background-color here only ever animates the inactive hover tint).
 */
export const NAV_PILL =
    'relative inline-flex items-center rounded-full px-3 py-1 border border-transparent transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/**
 * Active pill, minus the indicator: ink and weight only.
 *
 * Was `border-primary text-primary-foreground` — a foreground colour, because the
 * label used to sit on a solid fill. There is no fill now, so it takes the brand
 * TEXT value. `text-primary` would be wrong: that token is tuned to carry white
 * button text and measures 3.58:1 as text on a dark card.
 */
export const NAV_PILL_ACTIVE = 'border-transparent font-semibold text-primary-ink';

/** Inactive pill hover. */
export const NAV_PILL_IDLE = 'hover:bg-foreground/10 hover:text-foreground';

/**
 * The sliding indicator. Rendered only for the active pill; framer hands its box
 * over to whichever pill claims the same `layoutId` next.
 *
 * It is a 2px RULE, not a fill. The solid `bg-primary` pill this replaces was the
 * single largest chromatic surface in the persistent frame — every screen opened
 * with part of its colour budget already spent on chrome, and chrome is not a
 * state. Keeping the `layoutId` means the slide is preserved: it slides a rule.
 *
 * Being 2px at the bottom edge it no longer overlaps the label, so the
 * `relative z-raised` stacking guard the labels used to need — an absolutely
 * positioned sibling paints above a static one whatever the DOM order — is no
 * longer required. `inset-x-2` insets it inside the pill's own `px-3` so the rule
 * reads as belonging to the word rather than to the padding box.
 */
export const NavIndicator = ({ layoutId }: { layoutId: string }) => (
    <motion.span
        layoutId={layoutId}
        transition={NAV_INDICATOR_TRANSITION}
        className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary-ink"
        aria-hidden
    />
);

export const NavLink = ({ item, mobile = false }: NavLinkProps) => {
    const pathname = usePathname();
    const active = isNavActive(item, pathname);

    return (
        <Link
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
                NAV_PILL,
                mobile ? 'gap-1' : 'gap-2',
                active ? NAV_PILL_ACTIVE : NAV_PILL_IDLE
            )}
        >
            {active ? <NavIndicator layoutId={mobile ? MOBILE_INDICATOR : TOP_NAV_INDICATOR} /> : null}
            <span className="relative z-raised">{item.label}</span>
        </Link>
    );
};
