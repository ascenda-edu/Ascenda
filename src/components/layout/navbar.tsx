'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  const logoSrc = '/Ascenda_Logo-removebg-.png';
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const handleSignOut = async () => {
    // Confirm before signing out — the button sits a click away from the
    // bell and theme toggle, so accidental clicks during a demo would
    // dump us to the login screen with no easy recovery.
    if (typeof window !== 'undefined' && !window.confirm('Sign out of Ascenda?')) {
      return;
    }
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  };

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="px-3 pb-2 pt-2 sm:px-6 sm:pb-3 sm:pt-3 lg:px-10">
        <div
          className={cn(
            'flex w-full items-center justify-between rounded-2xl border border-border bg-card/95 px-3 py-1.5 sm:px-4 sm:py-2 text-foreground backdrop-blur-lg transition-all dark:border-white/10 dark:bg-card/90',
            scrolled ? 'shadow-md' : 'shadow-sm'
          )}
        >
          <Link href="/dashboard" className="flex items-center gap-2 sm:gap-3 text-lg font-semibold text-foreground">
            <div className="relative h-9 w-9 shrink-0 sm:h-12 sm:w-12 sm:scale-125">
              <Image
                src={logoSrc}
                alt="Ascenda logo"
                fill
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
          </div>
        </div>
      </div>
    </header>
  );
};
