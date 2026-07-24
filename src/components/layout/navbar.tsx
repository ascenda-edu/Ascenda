'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '../theme/theme-toggle';
import { getTopNavEntries, NAV_ITEMS } from './navigation';
import { useUserRole } from '@/hooks/use-user-role';
import { NavLink } from './nav-link';
import { NavDropdown } from './nav-dropdown';

import { LogOut } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useSupabase } from '@/hooks/useSupabase';
import { Button } from '../ui/button';
import { CommandPaletteIconTrigger, CommandPaletteTrigger } from './command-palette';
import { NotificationBell } from '@/components/notifications/notification-bell';

export const Navbar = () => {
  const role = useUserRole();
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabase();
  const navEntries = getTopNavEntries(NAV_ITEMS, role, pathname);
  const logoSrc = '/ascenda-logo.png';
  const [scrolled, setScrolled] = useState(false);
  // Two-step confirm — the sign-out button sits a click away from the bell and
  // theme toggle, so an accidental click during a demo would dump us to the
  // login screen. First click arms; second click (or Enter) signs out.
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(
    () => () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    },
    []
  );

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

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="shell-gutter pb-2 pt-2 sm:pb-3 sm:pt-3">
        <div
          className={cn(
            'flex w-full items-center justify-between rounded-2xl border border-border bg-card/95 px-3 py-1.5 sm:px-4 sm:py-2 text-foreground backdrop-blur-lg transition-all dark:border-white/10 dark:bg-card/90',
            scrolled ? 'shadow-md' : 'shadow-sm'
          )}
        >
          <Link href="/dashboard" className="flex items-center gap-2 sm:gap-3 text-lg font-semibold text-foreground">
            <div className="relative h-9 w-9 shrink-0 sm:h-[60px] sm:w-[60px]">
              <Image
                src={logoSrc}
                alt="Ascenda logo"
                fill
                sizes="60px"
                className={cn('rounded-full object-contain transition')}
              />
            </div>
            <span className="navbar-brand text-base sm:text-lg transition-colors">Ascenda</span>
          </Link>
          <nav className="hidden items-center gap-5 text-xs font-medium text-muted-foreground md:flex">
            {navEntries.map((entry) =>
              entry.type === 'group' ? (
                <NavDropdown
                  key={entry.label}
                  label={entry.label}
                  icon={entry.icon}
                  items={entry.items}
                />
              ) : entry.item.href.endsWith('/assistant') ? (
                // Assistant is a cross-cutting tool, not a journey step — it
                // anchors the right edge behind a divider on every portal.
                <div key={entry.item.href} className="flex items-center gap-5">
                  <span className="h-4 w-px rounded-full bg-border dark:bg-white/15" aria-hidden />
                  <NavLink item={entry.item} />
                </div>
              ) : (
                <NavLink key={entry.item.href} item={entry.item} />
              )
            )}
          </nav>
          <div className="flex items-center gap-2">
            <CommandPaletteTrigger />
            <CommandPaletteIconTrigger />
            <NotificationBell />
            <ThemeToggle compact />
            {confirmSignOut ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                onBlur={() => setConfirmSignOut(false)}
                autoFocus
                className="gap-1.5 rounded-full bg-destructive/10 text-xs text-destructive hover:bg-destructive/20 hover:text-destructive"
                title="Confirm sign out"
                aria-label="Confirm sign out"
              >
                <LogOut className="h-4 w-4" />
                Confirm?
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSignOut}
                className="rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
