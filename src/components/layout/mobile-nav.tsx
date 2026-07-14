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
  const panelRef = useRef<HTMLDivElement>(null);
  // Two-step confirm (matches desktop navbar) — sign-out lives in the More
  // panel now, but it's still a destructive action, so arm-then-confirm.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSignOut = async () => {
    if (!confirmSignOut) {
      setConfirmSignOut(true);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirmSignOut(false), 3000);
      return;
    }
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  };

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    []
  );

  // Show the first 4 destinations inline; everything else lives behind the
  // "More" button so no destination is silently dropped. Sign-out also lives
  // in the More panel, so the button is always present.
  const primaryItems = items.slice(0, 4);
  const overflowItems = items.slice(4);

  // Close the More panel whenever the route changes (user picked an item).
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  // On open, move focus into the panel (menu semantics); on close, disarm the
  // sign-out confirm so it never lingers into the next open.
  useEffect(() => {
    if (!moreOpen) {
      setConfirmSignOut(false);
      return;
    }
    const firstItem = panelRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }, [moreOpen]);

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
            ref={panelRef}
            role="menu"
            aria-label="More destinations"
            className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border border-border/50 bg-card/95 p-2 shadow-xl backdrop-blur-xl dark:border-white/10 dark:bg-muted/40"
          >
            {overflowItems.length > 0 && (
              <ul className="grid grid-cols-2 gap-1">
                {overflowItems.map((item) => {
                  const Icon = item.icon;
                  const active = isNavActive(item, pathname);
                  return (
                    <li key={item.href} role="none">
                      <Link
                        href={item.href}
                        role="menuitem"
                        aria-current={active ? 'page' : undefined}
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
            )}
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition',
                overflowItems.length > 0 && 'mt-1 border-t border-border/40 pt-2.5',
                confirmSignOut
                  ? 'text-destructive'
                  : 'text-muted-foreground hover:text-destructive active:bg-destructive/10'
              )}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{confirmSignOut ? 'Tap again to confirm' : 'Sign out'}</span>
            </button>
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
                aria-current={active ? 'page' : undefined}
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

          <button
            ref={moreButtonRef}
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-label="More destinations and sign out"
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
        </div>
      </div>
    </nav>
  );
};
