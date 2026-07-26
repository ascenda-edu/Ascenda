'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, UserX, Clock, TrendingDown, Pin, PinOff, EyeOff, Eye, Settings2, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { CounsellorStudent, StudentFlag } from '@/lib/counsellor/types';

interface StudentAlertsProps {
  students: CounsellorStudent[];
}

const FLAG_CONFIG: Record<StudentFlag, { label: string; icon: typeof AlertTriangle; color: string; bg: string }> = {
  profile_incomplete: { label: 'Profile incomplete', icon: UserX, color: 'text-warning', bg: 'bg-warning-subtle' },
  deadline_urgent: { label: 'Deadline in ≤5 days', icon: Clock, color: 'text-danger', bg: 'bg-danger-subtle' },
  no_matches: { label: 'No matches yet', icon: TrendingDown, color: 'text-info', bg: 'bg-info-subtle' },
  // `stalled` was the app's only orange; it is the same "needs a nudge" state as an
  // incomplete profile, so it wears `warning` too.
  stalled: { label: 'Stalled — no recent activity', icon: AlertTriangle, color: 'text-warning', bg: 'bg-warning-subtle' }
};

export const StudentAlerts = ({ students }: StudentAlertsProps) => {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [manageOpen, setManageOpen] = useState(false);

  const flagged = students.filter((s) => s.flags.length > 0);

  const togglePin = (id: string) =>
    setPinnedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleHide = (id: string) =>
    setHiddenIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (flagged.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-success-subtle">
          <AlertTriangle className="h-5 w-5 text-success" />
        </div>
        <p className="text-sm font-semibold text-foreground">All students on track</p>
        <p className="text-xs text-muted-foreground">No attention flags at this time.</p>
      </div>
    );
  }

  const allAlerts = flagged.flatMap((student) =>
    student.flags.map((flag) => ({ student, flag }))
  );

  const visible = allAlerts
    .filter(({ student }) => !hiddenIds.has(student.id))
    .sort((a, b) => {
      const aPinned = pinnedIds.has(a.student.id) ? 0 : 1;
      const bPinned = pinnedIds.has(b.student.id) ? 0 : 1;
      return aPinned - bPinned;
    });

  const shown = visible.slice(0, 5);
  const extra = visible.length - shown.length;

  return (
    <div className="space-y-3">
      {/* Manage toggle */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setManageOpen((o) => !o)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 text-label font-medium transition hover:-translate-y-0.5',
            manageOpen
              ? 'border-primary/40 bg-primary/10 text-primary-ink'
              : 'border-border/60 bg-background/60 text-muted-foreground hover:text-foreground'
          )}
        >
          <Settings2 className="h-3 w-3" />
          Manage
          <ChevronDown className={cn('h-3 w-3 transition', manageOpen && 'rotate-180')} />
        </button>
      </div>

      {/* Manage panel */}
      <AnimatePresence>
        {manageOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 space-y-1.5">
              <p className="eyebrow px-1 pb-0.5">
                Flagged students
              </p>
              {flagged.map((student) => {
                const isPinned = pinnedIds.has(student.id);
                const isHidden = hiddenIds.has(student.id);
                return (
                  <div
                    key={student.id}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-2 py-1.5 transition',
                      isHidden ? 'opacity-40' : 'bg-background/60'
                    )}
                  >
                    <span className="text-sm">{student.personal.flagEmoji}</span>
                    <span className="flex-1 truncate text-xs font-medium text-foreground">
                      {student.personal.firstName} {student.personal.lastName}
                    </span>
                    <span className="text-label text-muted-foreground">{student.flags.length} flag{student.flags.length !== 1 ? 's' : ''}</span>
                    <button
                      onClick={() => togglePin(student.id)}
                      title={isPinned ? 'Unpin' : 'Pin to top'}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-lg border transition',
                        isPinned
                          ? 'border-primary/40 bg-primary/10 text-primary-ink'
                          : 'border-border/60 text-muted-foreground hover:text-primary-ink hover:border-primary/40'
                      )}
                    >
                      {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => toggleHide(student.id)}
                      title={isHidden ? 'Show' : 'Hide'}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-lg border transition',
                        isHidden
                          ? 'border-success/25 bg-success-subtle text-success'
                          : 'border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/40'
                      )}
                    >
                      {isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </button>
                  </div>
                );
              })}
              {(pinnedIds.size > 0 || hiddenIds.size > 0) && (
                <button
                  onClick={() => { setPinnedIds(new Set()); setHiddenIds(new Set()); }}
                  className="mt-1 w-full text-center text-label text-muted-foreground hover:text-foreground transition"
                >
                  Reset all
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Alert list */}
      <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <AnimatePresence initial={false}>
          {shown.map(({ student, flag }) => {
            const cfg = FLAG_CONFIG[flag];
            const Icon = cfg.icon;
            const isPinned = pinnedIds.has(student.id);
            return (
              <motion.div
                key={`${student.id}-${flag}`}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
              >
                <Link
                  href={`/counsellor/students/${student.id}`}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 transition hover:bg-muted/40 hover:shadow-e-1',
                    isPinned && 'border-primary/20 bg-primary/5'
                  )}
                >
                  {isPinned && <Pin className="h-3 w-3 shrink-0 text-primary-ink/50" />}
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}>
                    <Icon className={`h-4 w-4 ${cfg.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {student.personal.flagEmoji} {student.personal.firstName} {student.personal.lastName}
                    </p>
                    <p className={`text-xs ${cfg.color}`}>{cfg.label}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">View →</span>
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {(extra > 0 || hiddenIds.size > 0) && (
        <div className="flex items-center justify-between px-1">
          {extra > 0 ? (
            <Link
              href="/counsellor/students?filter=flagged"
              className="text-xs text-muted-foreground hover:text-foreground transition"
            >
              +{extra} more — view all
            </Link>
          ) : <span />}
          {hiddenIds.size > 0 && (
            <span className="text-xs text-muted-foreground">{hiddenIds.size} hidden</span>
          )}
        </div>
      )}

      {shown.length === 0 && (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No alerts to show — unhide students to see their flags.
        </div>
      )}
    </div>
  );
};
