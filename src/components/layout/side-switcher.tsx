'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Briefcase, GraduationCap, HeartHandshake, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsDemoUser } from '@/lib/demo/use-is-demo-user';
import { SESSION_ROLE_KEY, useRole } from '@/lib/auth/role-context';

type Mode = 'student' | 'counsellor' | 'parent';

// One neutral treatment for all three. These carried info / feature / success —
// three hues over three portals, which is a nominal set wearing the status
// palette: "Parent view" was rendered in the done-green purely because it was
// third. Nothing here has succeeded or is pending; the icon and the label tell
// the three apart.
const MODE_ACCENT = 'text-muted-foreground hover:bg-muted/60';

const MODES: Record<Mode, { path: string; label: string; icon: LucideIcon; accent: string }> = {
  student: {
    path: '/dashboard',
    label: 'Student view',
    icon: GraduationCap,
    accent: MODE_ACCENT,
  },
  counsellor: {
    path: '/counsellor',
    label: 'Faculty view',
    icon: Briefcase,
    accent: MODE_ACCENT,
  },
  parent: {
    path: '/parent',
    label: 'Parent view',
    icon: HeartHandshake,
    accent: MODE_ACCENT,
  },
};

const modeForPath = (pathname: string | null): Mode => {
  if (pathname?.startsWith('/counsellor')) return 'counsellor';
  if (pathname?.startsWith('/parent')) return 'parent';
  return 'student';
};

export const SideSwitcher = ({ className, collapsed }: { className?: string; collapsed?: boolean }) => {
  const pathname = usePathname();
  const router = useRouter();
  const isDemo = useIsDemoUser();
  // Server-resolved (RoleProvider in DashboardShell); no browser round trip.
  const role = useRole();

  const currentMode = modeForPath(pathname);
  const otherModes = (Object.keys(MODES) as Mode[]).filter((mode) => mode !== currentMode);

  // Warm the other sides' chunks + RSC payloads so a flip in the demo lands
  // instantly rather than triggering a cold server-render. Runs
  // unconditionally to satisfy hook rules — cheap when the component will
  // ultimately render null.
  useEffect(() => {
    otherModes.forEach((mode) => router.prefetch(MODES[mode].path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, currentMode]);

  // Demo + admin only. Hide for real students and counsellors in production.
  if (!isDemo && role !== 'admin') return null;

  const handleSwitch = (mode: Mode) => {
    try {
      // The demo view preference. `useRole` reads this key back and lets it
      // outrank the server-resolved role for CHROME only — see the header of
      // @/lib/auth/role-context.
      sessionStorage.setItem(SESSION_ROLE_KEY, mode);
    } catch {
      // sessionStorage can throw in private mode; the route guard handles fallback.
    }
    router.push(MODES[mode].path);
  };

  return (
    <div className={cn('space-y-0.5', className)}>
      {otherModes.map((mode) => {
        const { label, icon: Icon, accent } = MODES[mode];
        if (collapsed) {
          return (
            <button
              key={mode}
              type="button"
              onClick={() => handleSwitch(mode)}
              title={label}
              aria-label={label}
              className={cn(
                'flex h-9 w-full items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                accent
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
            </button>
          );
        }
        return (
          <button
            key={mode}
            type="button"
            onClick={() => handleSwitch(mode)}
            title={label}
            className={cn(
              'group flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              accent
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
};
