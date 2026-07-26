'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNavActive, type NavItem } from './navigation';
import {
  NavIndicator,
  NAV_PILL,
  NAV_PILL_ACTIVE,
  NAV_PILL_IDLE,
  TOP_NAV_INDICATOR,
} from './nav-link';

interface NavDropdownProps {
  label: string;
  /**
   * Group icon from the nav config. Deliberately NOT rendered in the top bar:
   * NavLink also renders label-only there, and drawing an icon on grouped pills
   * only would break the "one row" reading. Kept on the props so the same nav
   * group object can be spread here and into the icon-bearing mobile/sidebar
   * renderers without a separate shape.
   */
  icon: LucideIcon;
  items: NavItem[];
}

// A single top-bar pill that opens a small menu of related destinations.
// Styled to match NavLink so grouped and ungrouped pills read as one row — the
// shell classes are literally NavLink's, imported rather than copied, and the
// active indicator is NavLink's too: one shared `layoutId` for the whole bar, so
// the fill slides between a grouped pill and an ungrouped one as if the row were
// a single control. That's why the indicator id there is a module constant and
// not a `useId` — see the note in nav-link.tsx.
export const NavDropdown = ({ label, items }: NavDropdownProps) => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const groupActive = items.some((item) => isNavActive(item, pathname));

  // Close when the route changes (a menu item was chosen).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on outside click and on Escape (returning focus to the trigger).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        className={cn(NAV_PILL, 'gap-1', groupActive ? NAV_PILL_ACTIVE : NAV_PILL_IDLE)}
      >
        {groupActive ? <NavIndicator layoutId={TOP_NAV_INDICATOR} /> : null}
        {/* Both children need their own stacking position: the indicator is an
            absolutely-positioned sibling, so it paints over anything static
            regardless of DOM order — label and chevron alike. */}
        <span className="relative z-raised">{label}</span>
        <ChevronDown
          className={cn(
            'relative z-raised h-3.5 w-3.5 transition-transform duration-200',
            open && 'rotate-180'
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-1/2 top-full z-50 mt-2 w-48 -translate-x-1/2 rounded-2xl border border-border bg-card/95 p-1.5 shadow-e-4 backdrop-blur-xl dark:border-white/10 dark:bg-card/90"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-foreground'
                    : 'text-muted-foreground hover:bg-foreground/5 hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
