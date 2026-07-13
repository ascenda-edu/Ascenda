'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarPlus, ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { filterNavByRole, isNavActive, NAV_ITEMS } from './navigation';
import { useUserRole } from '@/hooks/use-user-role';
import { useSupabase } from '@/hooks/useSupabase';
import { useSidebar } from './sidebar-context';
import { SideSwitcher } from './side-switcher';

export const Sidebar = () => {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabase();
  const role = useUserRole();
  const items = filterNavByRole(NAV_ITEMS, role, pathname);
  const { collapsed, toggle } = useSidebar();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.refresh();
    router.push('/login');
  };

  return (
    <aside
      className={cn(
        'sticky top-28 hidden self-start rounded-2xl border border-border bg-card text-foreground shadow-sm transition-[width] duration-200 md:block dark:border-white/10 dark:bg-card',
        collapsed ? 'w-16 p-2' : 'w-60 p-3'
      )}
      aria-label="Primary navigation"
      data-collapsed={collapsed ? 'true' : 'false'}
    >
      <div className={cn('flex items-center', collapsed ? 'justify-center' : 'justify-between px-1 pb-2')}>
        {!collapsed ? (
          <span className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Menu</span>
        ) : null}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (⌘B)`}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="space-y-0.5">
        {items.map((item) => {
          const active = isNavActive(item, pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={cn(
                'group flex h-9 items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                active && 'bg-primary/10 text-foreground font-semibold'
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0',
                  active ? 'text-foreground' : 'text-muted-foreground group-hover:text-foreground'
                )}
                aria-hidden
              />
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          );
        })}

        <SideSwitcher className={cn('mt-1 w-full', collapsed ? 'justify-center px-0 rounded-lg' : '')} collapsed={collapsed} />

        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
          aria-label={collapsed ? 'Sign out' : undefined}
          className={cn(
            'flex h-9 w-full items-center rounded-lg text-sm font-medium text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive',
            collapsed ? 'justify-center px-0' : 'gap-3 px-3'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed ? <span className="truncate">Sign out</span> : null}
        </button>
      </nav>

      {!pathname.startsWith('/counsellor') && !collapsed ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-primary/20 bg-primary/5 p-3 text-foreground transition-colors">
          <div className="flex items-center gap-2.5">
            <div className="relative shrink-0">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-400 to-primary text-[11px] font-bold text-white shadow-sm"
                aria-hidden
              >
                SM
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-500"
                aria-label="Available today"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">Sarah Mitchell</p>
              <p className="text-[11px] text-muted-foreground">Your counsellor · usually replies same-day</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Stuck on an essay or shortlist? Sarah&apos;s here to help — book a chat.
          </p>
          <Link
            href="/appointment"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Book a chat with Sarah
          </Link>
        </div>
      ) : null}

      {!pathname.startsWith('/counsellor') && collapsed ? (
        <Link
          href="/appointment"
          title="Request appointment"
          aria-label="Request appointment"
          className="mt-3 flex h-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition hover:bg-primary/90"
        >
          <CalendarPlus className="h-4 w-4" />
        </Link>
      ) : null}
    </aside>
  );
};
