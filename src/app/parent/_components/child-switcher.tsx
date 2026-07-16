'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LinkedChild } from '@/lib/parent/types';
import { ACTIVE_CHILD_COOKIE } from '@/lib/parent/active-child';

// Switches which linked child the /parent section shows. The selection is a
// cookie (not localStorage) so the server components can read it; switching
// refreshes the current route. Only linked children are ever offered — the
// list comes from guardian_links via loadLinkedChildren.
export function ChildSwitcher({
  linkedChildren,
  activeChildId,
}: {
  linkedChildren: LinkedChild[];
  activeChildId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Dismiss on outside-click and Escape (returning focus to the trigger) so
  // the dropdown behaves like the rest of the app's popovers.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = linkedChildren.find((c) => c.profileId === activeChildId) ?? linkedChildren[0];
  if (!active) return null;

  // Single child: a static identity chip, no dropdown affordance.
  if (linkedChildren.length === 1) {
    return (
      <span className="surface-chip gap-2">
        <span role="img" aria-label={`${active.name}'s flag`}>{active.flagEmoji}</span>
        <span className="font-semibold text-foreground">{active.name}</span>
      </span>
    );
  }

  const select = (child: LinkedChild) => {
    setOpen(false);
    if (child.profileId === active.profileId) return;
    document.cookie = `${ACTIVE_CHILD_COOKIE}=${child.profileId}; path=/; max-age=${60 * 60 * 24 * 30}`;
    startTransition(() => router.refresh());
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="surface-chip gap-2 transition-colors hover:bg-muted"
      >
        <span role="img" aria-label={`${active.name}'s flag`}>{active.flagEmoji}</span>
        <span className="font-semibold text-foreground">{active.name}</span>
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        ) : (
          <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} aria-hidden />
        )}
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Switch child"
          className="absolute left-0 top-full z-20 mt-1 min-w-[180px] overflow-hidden rounded-xl border border-border bg-card py-1 shadow-md"
        >
          {linkedChildren.map((child) => (
            <li key={child.profileId} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={child.profileId === active.profileId}
                onClick={() => select(child)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60',
                  child.profileId === active.profileId ? 'font-semibold text-foreground' : 'text-muted-foreground'
                )}
              >
                <span role="img" aria-label={`${child.name}'s flag`}>{child.flagEmoji}</span>
                <span className="truncate">{child.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
