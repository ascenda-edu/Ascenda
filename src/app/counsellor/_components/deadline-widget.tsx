'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Clock, CalendarDays, Pin, PinOff, EyeOff, Eye, Settings2, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';

interface DeadlineItem {
  id: string;
  university: string;
  program: string;
  date: string;
  type: string;
  studentId: string;
  studentName: string;
  studentFlag: string;
  daysUntil: number;
}

interface DeadlineWidgetProps {
  deadlines: DeadlineItem[];
}

const TYPE_LABELS: Record<string, string> = {
  early_decision: 'Early Decision',
  regular: 'Regular',
  scholarship: 'Scholarship',
  interview: 'Interview'
};

function urgencyClass(days: number) {
  if (days <= 3) return 'text-danger bg-danger-subtle border-danger/30';
  if (days <= 7) return 'text-warning bg-warning-subtle border-warning/30';
  return 'text-muted-foreground bg-muted border-border';
}

function formatDate(iso: string) {
  return parseLocalDate(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function getStudents(deadlines: DeadlineItem[]) {
  const seen = new Set<string>();
  return deadlines
    .filter((d) => { if (seen.has(d.studentId)) return false; seen.add(d.studentId); return true; })
    .map((d) => ({ id: d.studentId, name: d.studentName, flag: d.studentFlag }));
}

export const DeadlineWidget = ({ deadlines }: DeadlineWidgetProps) => {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [manageOpen, setManageOpen] = useState(false);

  const togglePin = (id: string) =>
    setPinnedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleHide = (id: string) =>
    setHiddenIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  if (deadlines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <CalendarDays className="mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No deadlines in the next 7 days</p>
      </div>
    );
  }

  const students = getStudents(deadlines);

  const visible = deadlines
    .filter((d) => !hiddenIds.has(d.studentId))
    .sort((a, b) => {
      const aPinned = pinnedIds.has(a.studentId) ? 0 : 1;
      const bPinned = pinnedIds.has(b.studentId) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return a.daysUntil - b.daysUntil;
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
              ? 'border-primary/30 bg-primary/10 text-primary-ink'
              : 'border-border bg-background text-muted-foreground hover:text-foreground'
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
            <div className="rounded-2xl border border-border bg-muted p-3 space-y-1.5">
              <p className="eyebrow px-1 pb-0.5">
                Students
              </p>
              {students.map(({ id, name, flag }) => {
                const isPinned = pinnedIds.has(id);
                const isHidden = hiddenIds.has(id);
                return (
                  <div
                    key={id}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-2 py-1.5 transition',
                      isHidden ? 'opacity-40' : 'bg-background'
                    )}
                  >
                    <span className="text-sm">{flag}</span>
                    <span className="flex-1 truncate text-xs font-medium text-foreground">{name}</span>
                    <button
                      onClick={() => togglePin(id)}
                      title={isPinned ? 'Unpin' : 'Pin to top'}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-lg border transition',
                        isPinned
                          ? 'border-primary/30 bg-primary/10 text-primary-ink'
                          : 'border-border text-muted-foreground hover:text-primary-ink hover:border-primary/30'
                      )}
                    >
                      {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => toggleHide(id)}
                      title={isHidden ? 'Show' : 'Hide'}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-lg border transition',
                        isHidden
                          ? 'border-success/30 bg-success-subtle text-success'
                          : 'border-border text-muted-foreground hover:text-destructive hover:border-destructive/30'
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

      {/* Deadline list */}
      <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <AnimatePresence initial={false}>
          {shown.map((d) => {
            const isPinned = pinnedIds.has(d.studentId);
            return (
              <motion.div
                key={d.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
              >
                <Link
                  href={`/counsellor/students/${d.studentId}`}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border border-border bg-background px-4 py-3 transition hover:bg-muted/60',
                    isPinned && 'border-primary/30 bg-primary/10'
                  )}
                >
                  {isPinned && <Pin className="h-3 w-3 shrink-0 text-primary-ink" />}
                  <div className={cn('flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border text-center text-xs font-bold leading-none', urgencyClass(d.daysUntil))}>
                    <Clock className="mb-0.5 h-3 w-3" />
                    {d.daysUntil <= 0 ? 'Due' : `${d.daysUntil}d`}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {d.studentFlag} {d.studentName}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {d.university} · {TYPE_LABELS[d.type] ?? d.type}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(d.date)}</span>
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {extra > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          +{extra} more{hiddenIds.size > 0 ? ` · ${hiddenIds.size} hidden` : ''}
        </p>
      )}

      {shown.length === 0 && (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No deadlines to show — unhide students to see their deadlines.
        </div>
      )}
    </div>
  );
};
