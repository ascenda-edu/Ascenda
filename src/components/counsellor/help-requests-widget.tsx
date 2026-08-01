'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, Sparkles, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShowMoreToggle } from '@/components/ui/show-more-toggle';
import { formatRelativeTime } from '@/lib/utils/dates';
import { useSupabase } from '@/hooks/useSupabase';
import { useHelpRequests } from '@/hooks/use-help-requests';
import { useHelpDrawer } from '@/components/help/help-drawer-provider';
import { resolveProfileNames } from '@/lib/demo/help-request-client';

export function HelpRequestsWidget() {
  const supabase = useSupabase();
  const { items, loading } = useHelpRequests();
  const { openRequest } = useHelpDrawer();
  const [expanded, setExpanded] = useState(false);

  // Real student names for the visible requests. Missing entries fall back to
  // 'Student' while the lookup is in flight (or if the profile is unreadable).
  // Keyed on the stable id set — `items` gets a fresh array identity on every
  // poll tick, which would otherwise re-fire the lookup continuously.
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const idsKey = useMemo(
    () => [...new Set(items.map((row) => row.student_profile_id))].sort().join(','),
    [items]
  );
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    resolveProfileNames(supabase, idsKey.split(','))
      .then((map) => {
        if (!cancelled) setNames(map);
      })
      .catch((err) => console.warn('help widget: name lookup failed', err));
    return () => {
      cancelled = true;
    };
  }, [supabase, idsKey]);

  const openCount = items.filter((row) => row.status === 'open').length;

  // Open requests first, then accepted; stable within each group so the
  // newest-first ordering from the data layer is preserved.
  const sorted = useMemo(
    () => [...items].sort((a, b) => Number(a.status === 'accepted') - Number(b.status === 'accepted')),
    [items]
  );
  const COLLAPSED_COUNT = 4;
  const visible = expanded ? sorted : sorted.slice(0, COLLAPSED_COUNT);

  return (
    <div className="surface-card">
      <div className="relative z-10 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-feature-subtle text-feature">
              <Inbox className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <p className="eyebrow">
                Live · from your students
              </p>
              <h2 className="text-lg font-semibold text-foreground">Help requests</h2>
              <p className="text-xs text-muted-foreground">
                {loading
                  ? 'Loading…'
                  : items.length === 0
                    ? "No open requests right now — you're all caught up."
                    : `${openCount} open${
                        items.length - openCount > 0 ? ` · ${items.length - openCount} accepted` : ''
                      }`}
              </p>
            </div>
          </div>
          <Link
            href="/counsellor/inbox"
            className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition hover:-translate-y-0.5 hover:bg-muted/60"
          >
            View inbox
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        {items.length > 0 ? (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {visible.map((req) => {
                const isAccepted = req.status === 'accepted';
                return (
                  <motion.li
                    key={req.id}
                    layout
                    initial={{ opacity: 0, y: -8, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: 'auto' }}
                    exit={{ opacity: 0, x: 20, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <button
                      type="button"
                      onClick={() => openRequest(req.id)}
                      className={cn(
                        'group flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left hover-lift',
                        isAccepted
                          ? 'border-success/25 bg-success-subtle hover:border-success/50'
                          : 'border-feature/25 bg-feature-subtle hover:border-feature/50'
                      )}
                    >
                      <Sparkles
                        className={cn(
                          'mt-0.5 h-4 w-4 shrink-0',
                          isAccepted ? 'text-success' : 'text-feature'
                        )}
                        aria-hidden
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {names.get(req.student_profile_id) ?? 'Student'}
                          </p>
                          <span className="eyebrow shrink-0">
                            {formatRelativeTime(req.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {req.university ? (
                            <>
                              {req.university}
                              {req.program ? ` · ${req.program}` : null}
                            </>
                          ) : (
                            req.subject
                          )}
                        </p>
                      </div>
                      {isAccepted ? (
                        <span className="eyebrow shrink-0 rounded-full bg-success-subtle px-2 py-0.5 text-success">
                          Accepted
                        </span>
                      ) : null}
                      <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" aria-hidden />
                    </button>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        ) : null}

        {sorted.length > COLLAPSED_COUNT && (
          <ShowMoreToggle
            expanded={expanded}
            onToggle={() => setExpanded((prev) => !prev)}
            total={sorted.length}
            noun="requests"
          />
        )}
      </div>
    </div>
  );
}
