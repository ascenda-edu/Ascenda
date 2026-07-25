'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNavActive, type NavItem } from './navigation';

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
// Styled to match NavLink so grouped and ungrouped pills read as one row.
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
        className={cn(
          'inline-flex items-center gap-1 rounded-full px-3 py-1 border border-transparent transition-all duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          groupActive
            ? 'border border-primary bg-primary text-primary-foreground shadow-sm'
            : 'hover:bg-foreground/5 hover:text-foreground'
        )}
      >
        <span>{label}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute left-1/2 top-full z-50 mt-2 w-48 -translate-x-1/2 rounded-2xl border border-border bg-card/95 p-1.5 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-card/90"
        >
          {items.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
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
