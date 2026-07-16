'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Briefcase, GraduationCap, HeartHandshake, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsDemoUser } from '@/lib/demo/use-is-demo-user';
import { useUserRole } from '@/hooks/use-user-role';

type Mode = 'student' | 'counsellor' | 'parent';

const MODES: Record<Mode, { path: string; label: string; icon: LucideIcon; accent: string }> = {
  student: {
    path: '/dashboard',
    label: 'Student view',
    icon: GraduationCap,
    accent: 'text-sky-600 hover:bg-sky-500/10 dark:text-sky-300',
  },
  counsellor: {
    path: '/counsellor',
    label: 'Faculty view',
    icon: Briefcase,
    accent: 'text-violet-600 hover:bg-violet-500/10 dark:text-violet-300',
  },
  parent: {
    path: '/parent',
    label: 'Parent view',
    icon: HeartHandshake,
    accent: 'text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-300',
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
  const role = useUserRole();

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
      sessionStorage.setItem('ascenda-session-role', mode);
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
                'flex h-9 w-full items-center justify-center rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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
              'group flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
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
