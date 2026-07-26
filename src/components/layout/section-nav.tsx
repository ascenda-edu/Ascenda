'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { SectionNavItem } from './navigation';

interface SectionNavProps {
  items: SectionNavItem[];
  getIsActive?: (item: SectionNavItem, pathname: string, searchParams: URLSearchParams) => boolean;
}

const TOOLBAR = 'surface-toolbar flex items-center gap-2 sm:gap-3 rounded-4xl overflow-x-auto scrollbar-none -mx-1 px-1';

// `.nav-pill` styles colour/background/border but declares no focus ring, so
// keyboard focus on a section tab was invisible. These are the same ring
// utilities nav-link.tsx uses, applied at the call site rather than in
// globals.css (which this pass does not touch).
const PILL_FOCUS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

export const SectionNav = (props: SectionNavProps) => (
  <Suspense fallback={
    // A loading state, not a convincing fake: this used to render <span>s
    // wearing `.nav-pill`, pixel-identical to the real tabs but unfocusable and
    // inert. Skeletons keep each tab's exact width (so hydration doesn't shift
    // the row) while reading unmistakably as "not ready yet".
    <nav aria-busy="true" aria-label="Loading section navigation" className={TOOLBAR}>
      {props.items.map((item) => (
        <Skeleton
          key={item.href}
          aria-hidden
          className="inline-flex h-8 shrink-0 items-center px-3 text-xs text-transparent sm:text-sm"
        >
          {item.label}
        </Skeleton>
      ))}
    </nav>
  }>
    <SectionNavInner {...props} />
  </Suspense>
);

const SectionNavInner = ({ items, getIsActive }: SectionNavProps) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <nav className={TOOLBAR}>
      {items.map((item) => {
        const active = getIsActive
          ? getIsActive(item, pathname, searchParams)
          : item.matchParam
            ? (() => {
              const value = searchParams.get(item.matchParam.key);
              if (!value && item.matchParam.value === 'personal') {
                return pathname.startsWith('/profile');
              }
              return value === item.matchParam.value;
            })()
            : item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'nav-pill shrink-0',
              PILL_FOCUS,
              active
                ? 'nav-pill-active'
                : ''
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};
