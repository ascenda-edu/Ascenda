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

/** Active pill, minus the fill: border and ink only. */
export const NAV_PILL_ACTIVE = 'border-primary text-primary-foreground';

/** Inactive pill hover. */
export const NAV_PILL_IDLE = 'hover:bg-foreground/5 hover:text-foreground';

/**
 * The sliding fill. Rendered only for the active pill; framer hands its box over
 * to whichever pill claims the same `layoutId` next.
 *
 * It is a SIBLING of the label, and an absolutely-positioned sibling paints
 * above a statically-positioned one whatever the DOM order — so every label in
 * here carries `relative z-raised` or the fill covers its own text.
 */
export const NavIndicator = ({ layoutId }: { layoutId: string }) => (
    <motion.span
        layoutId={layoutId}
        transition={NAV_INDICATOR_TRANSITION}
        className="absolute inset-0 rounded-full bg-primary shadow-e-1"
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
