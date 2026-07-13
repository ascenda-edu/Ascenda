'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { filterNavByRole, isNavActive, NAV_ITEMS } from './navigation';
import { useUserRole } from '@/hooks/use-user-role';
import { useSupabase } from '@/hooks/useSupabase';
import { LogOut, MoreHorizontal } from 'lucide-react';

export const MobileNav = () => {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabase();
  const role = useUserRole();
  const items = filterNavByRole(NAV_ITEMS, role, pathname);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const handleSignOut = async () => {
    // Match desktop navbar behaviour — confirm before a destructive action
    // that dumps the user on the login screen.
    if (typeof window !== 'undefined' && !window.confirm('Sign out of Ascenda?')) {
      return;
    }
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  };

  // Show the first 3 destinations inline; everything else lives behind the
  // "More" button so no destination is silently dropped. If everything fits
  // in 4 slots, skip the More button entirely.
  const hasOverflow = items.length > 4;
  const primaryItems = hasOverflow ? items.slice(0, 3) : items;
  const overflowItems = hasOverflow ? items.slice(3) : [];

  // Close the More panel whenever the route changes (user picked an item).
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // Dismiss on Escape and return focus to the trigger.
  useEffect(() => {
    if (!moreOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        moreButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [moreOpen]);

  // Mobile nav uses short labels — long ones like "Applications" or
  // "Scholarships" need to fit a ~64px-wide column on a 360-390px phone.
  const SHORT_LABELS: Record<string, string> = {
    Applications: 'Apply',
    Scholarships: 'Aid',
    Toolbox: 'Tools',
    Overview: 'Home',
    Students: 'Students',
    Analytics: 'Stats',
    Deadlines: 'Dates',
    Documents: 'Docs',
    Outcomes: 'Results',
    Parents: 'Parents'
  };

  const overflowActive = overflowItems.some((item) => isNavActive(item, pathname));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[env(safe-area-inset-bottom,8px)] pt-1 md:hidden">
      {moreOpen && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMoreOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-foreground/20 backdrop-blur-[2px]"
        />
      )}

      <div className="relative z-50 mx-auto max-w-md">
        {moreOpen && (
          <div
            id="mobile-nav-more-panel"
            className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-muted/40"
          >
            <ul className="grid grid-cols-2 gap-1">
              {overflowItems.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(item, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                        active
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground active:bg-muted/60'
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex items-end justify-between gap-1 rounded-2xl border border-border/50 bg-card/90 p-1.5 text-xs font-semibold text-muted-foreground shadow-lg backdrop-blur-xl dark:bg-muted/30 dark:border-white/10">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item, pathname);
            const label = SHORT_LABELS[item.label] ?? item.label;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                title={item.label}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition',
                  active
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'hover:text-foreground active:bg-muted/60'
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="max-w-full truncate text-[10px] font-medium leading-none">
                  {label}
                </span>
              </Link>
            );
          })}

          {hasOverflow && (
            <button
              ref={moreButtonRef}
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-label="More destinations"
              aria-expanded={moreOpen}
              aria-controls="mobile-nav-more-panel"
              aria-haspopup="menu"
              title="More"
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 transition',
                moreOpen || overflowActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'hover:text-foreground active:bg-muted/60'
              )}
            >
              <MoreHorizontal className="h-5 w-5 shrink-0" aria-hidden />
              <span className="max-w-full truncate text-[10px] font-medium leading-none">More</span>
            </button>
          )}

          <button
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="flex h-[46px] w-11 shrink-0 flex-col items-center justify-center gap-1 rounded-xl transition hover:text-destructive active:bg-destructive/10"
          >
            <LogOut className="h-5 w-5 shrink-0" aria-hidden />
            <span className="text-[10px] font-medium leading-none">Out</span>
          </button>
        </div>
      </div>
    </nav>
  );
};
