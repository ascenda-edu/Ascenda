'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Trophy, Pin, PinOff, EyeOff, Eye, Settings2, ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import { avatarColorAt } from './avatar-palette';

interface TopStudentsProps {
  students: CounsellorStudent[];
}

function getAvgMatchScore(student: CounsellorStudent) {
  if (student.matches.length === 0) return 0;
  return Math.round(student.matches.reduce((acc, m) => acc + m.score, 0) / student.matches.length);
}

function getInitials(first: string, last: string) {
  return `${first[0]}${last[0]}`.toUpperCase();
}

// Gold / silver / bronze. The medal ramp has no token family of its own, so it
// borrows the warning tone at two strengths with the neutral ink between them —
// three distinguishable steps, all tokenised.
const RANK_STYLES = [
  'text-warning',
  'text-muted-foreground',
  'text-warning/70'
];

export const TopStudents = ({ students }: TopStudentsProps) => {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [manageOpen, setManageOpen] = useState(false);

  const allRanked = [...students]
    .filter((s) => s.matches.length > 0)
    .sort((a, b) => getAvgMatchScore(b) - getAvgMatchScore(a));

  const visible = allRanked
    .filter((s) => !hiddenIds.has(s.id))
    .sort((a, b) => {
      const aPinned = pinnedIds.has(a.id) ? 0 : 1;
      const bPinned = pinnedIds.has(b.id) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return getAvgMatchScore(b) - getAvgMatchScore(a);
    });

  const shown = visible.slice(0, 5);
  const extra = visible.length - shown.length;

  const togglePin = (id: string) =>
    setPinnedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleHide = (id: string) =>
    setHiddenIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

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
                Students
              </p>
              {allRanked.map((student) => {
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
                    <div className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-label font-bold', avatarColorAt(allRanked.indexOf(student)))}>
                      {getInitials(student.personal.firstName, student.personal.lastName)}
                    </div>
                    <span className="flex-1 truncate text-xs font-medium text-foreground">
                      {student.personal.firstName} {student.personal.lastName}
                    </span>
                    <span className="text-label font-bold text-primary-ink">{getAvgMatchScore(student)}</span>
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

      {/* List */}
      <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <AnimatePresence initial={false}>
          {shown.map((student, idx) => {
            const score = getAvgMatchScore(student);
            const initials = getInitials(student.personal.firstName, student.personal.lastName);
            const avatarColor = avatarColorAt(idx);
            const isPinned = pinnedIds.has(student.id);

            return (
              <motion.div
                key={student.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
              >
                <Link
                  href={`/counsellor/students/${student.id}`}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border border-border/60 bg-background/60 px-4 py-3 transition hover:bg-muted/40',
                    isPinned && 'border-primary/20 bg-primary/5'
                  )}
                >
                  {isPinned && <Pin className="h-3 w-3 shrink-0 text-primary-ink/50" />}
                  <span className={cn('w-5 shrink-0 text-center text-xs font-bold', RANK_STYLES[idx] ?? 'text-muted-foreground')}>
                    {idx + 1}
                  </span>
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarColor}`}>
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {student.personal.firstName} {student.personal.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {student.academic.programmeType === 'IB'
                        ? student.academic.ibPoints ? `IB ${student.academic.ibPoints} pts` : 'IB'
                        : student.academic.aLevelGrades ? `A-Level ${student.academic.aLevelGrades}` : 'A-Level'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-primary-ink">{score}</p>
                    <p className="text-label text-muted-foreground">avg score</p>
                  </div>
                  {idx < 3 && !isPinned && <Trophy className={`h-4 w-4 shrink-0 ${RANK_STYLES[idx]}`} />}
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
          No students to show — unhide students to see rankings.
        </div>
      )}
    </div>
  );
};
