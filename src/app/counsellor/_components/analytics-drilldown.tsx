'use client';

import { useEffect, useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, GraduationCap, MapPin, ArrowUpRight, Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import type { CounsellorStudent } from '@/lib/counsellor/types';

/* ─── Types ──────────────────────────────────────────────────────────────────── */

export interface DrilldownItem {
  student: CounsellorStudent;
  detail?: string;
  badge?: { label: string; color: string };
}

export interface DrilldownStat {
  label: string;
  value: string;
}

export interface DrilldownState {
  title: string;
  subtitle?: string;
  accentColor: string;
  items: DrilldownItem[];
  summaryStats?: DrilldownStat[];
}

interface DrilldownPanelProps {
  data: DrilldownState | null;
  onClose: () => void;
}

/* ─── Modal ──────────────────────────────────────────────────────────────────── */

export const DrilldownPanel = ({ data, onClose }: DrilldownPanelProps) => {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Radix keeps DialogContent mounted for the length of the exit animation, by
  // which time `data` is already null. Retaining the last non-null value lets the
  // close animation render the panel it is animating away, rather than blanking
  // it a frame before it leaves.
  const [snapshot, setSnapshot] = useState<DrilldownState | null>(data);
  useEffect(() => {
    if (data) setSnapshot(data);
  }, [data]);

  // Reset search when modal opens/changes
  useEffect(() => {
    setSearch('');
    setExpanded(null);
  }, [data?.title]);

  const filtered = snapshot?.items.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const s = item.student;
    return (
      `${s.personal.firstName} ${s.personal.lastName}`.toLowerCase().includes(q) ||
      s.personal.school.toLowerCase().includes(q) ||
      s.personal.schoolCountry.toLowerCase().includes(q) ||
      (item.detail?.toLowerCase().includes(q) ?? false)
    );
  }) ?? [];

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  return (
    // Radix Dialog owns the focus trap, Escape, scroll lock, `aria-modal`,
    // `aria-labelledby`/`describedby` and focus restore. The hand-rolled
    // FOCUSABLE query, onTrapKeyDown, Escape listener, body-overflow lock and
    // previouslyFocused ref this file used to carry are all deleted — keeping any
    // of them would double-handle the same key. z-modal now comes from
    // DialogContent, which is where the "at z-50 this lost to the chat panel"
    // regression was fixed for good.
    <Dialog
      open={Boolean(data)}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {snapshot && (
        <DialogContent className="flex max-h-[min(85vh,720px)] w-full max-w-2xl flex-col rounded-3xl">
          {/* ── Accent bar ──────────────────────────────────────────────────── */}
          <div className={cn('h-1 w-full', snapshot.accentColor)} />

          {/* ── Header ──────────────────────────────────────────────────────── */}
          <div className="flex items-start gap-4 px-6 pt-5 pb-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-xl font-bold leading-tight text-foreground">
                {snapshot.title}
              </DialogTitle>
              {/* Always rendered: Radix wires aria-describedby to it, and a modal
                  with no accessible description warns in development. When the
                  caller has no subtitle, the student count is the honest one. */}
              <DialogDescription
                className={cn(
                  'mt-1 text-sm text-muted-foreground',
                  !snapshot.subtitle && 'sr-only'
                )}
              >
                {snapshot.subtitle
                  ?? `${snapshot.items.length} student${snapshot.items.length !== 1 ? 's' : ''}`}
              </DialogDescription>
            </div>
            <DialogClose
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </DialogClose>
          </div>

          {/* ── Summary stats row ───────────────────────────────────────────── */}
          {snapshot.summaryStats && snapshot.summaryStats.length > 0 && (
            <div className="mx-6 mb-4 flex gap-2 overflow-x-auto">
              {snapshot.summaryStats.map((stat) => (
                <div
                  key={stat.label}
                  className="flex min-w-0 shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2"
                >
                  <span className="text-sm font-bold text-foreground tabular-nums">{stat.value}</span>
                  <span className="truncate text-xs text-muted-foreground">{stat.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* ── Search ──────────────────────────────────────────────────────── */}
          {snapshot.items.length > 3 && (
            <div className="mx-6 mb-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search students…"
                  aria-label="Search students"
                  className="form-input rounded-xl py-2.5 pl-9 pr-4"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    aria-label="Clear search"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Count indicator ─────────────────────────────────────────────── */}
          <div className="mx-6 mb-2 flex items-center justify-between">
            <p className="eyebrow">
              {filtered.length === snapshot.items.length
                ? `${snapshot.items.length} student${snapshot.items.length !== 1 ? 's' : ''}`
                : `${filtered.length} of ${snapshot.items.length} students`
              }
            </p>
          </div>

          {/* ── Student list ────────────────────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 pb-5">
            {filtered.length === 0 ? (
              <EmptyState
                icon={<Search />}
                title="No students found"
                description={search ? 'Try a different search term' : 'No students match this filter'}
              />
            ) : (
              <div className="space-y-1.5">
                {filtered.map(({ student, detail, badge }, i) => {
                    const isExpanded = expanded === student.id;
                    return (
                      <motion.div
                        key={student.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.3) }}
                      >
                        {/* Row */}
                        <button
                          onClick={() => toggleExpand(student.id)}
                          className={cn(
                            'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition',
                            isExpanded
                              ? 'bg-muted/60 shadow-e-1'
                              : 'hover:bg-muted/40'
                          )}
                        >
                          {/* Flag avatar */}
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/60 text-lg ring-2 ring-background">
                            {student.personal.flagEmoji}
                          </div>

                          {/* Name + meta */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold text-foreground">
                                {student.personal.firstName} {student.personal.lastName}
                              </span>
                              {badge && (
                                // `badge.color` arrives from _analytics-client.tsx as a
                                // ready-made tone bundle, so `variant="bare"` takes the
                                // pill geometry from Badge and leaves the colour alone.
                                <Badge
                                  variant="bare"
                                  size="sm"
                                  className={cn('shrink-0 font-bold', badge.color)}
                                >
                                  {badge.label}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                              <span>{student.academic.programmeType === 'IB'
                                ? `IB ${student.academic.ibPoints ?? '—'}`
                                : `A-Level`
                              }</span>
                              <span className="text-border">·</span>
                              <span>{student.personal.school}</span>
                            </div>
                          </div>

                          {/* Expand indicator */}
                          <ChevronDown className={cn(
                            'h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-200',
                            isExpanded && 'rotate-180'
                          )} />
                        </button>

                        {/* Expanded detail */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden"
                            >
                              <div className="mx-4 mb-2 mt-1 rounded-xl border border-border/50 bg-card px-4 py-3 space-y-3">
                                {/* Detail text */}
                                {detail && (
                                  <p className="text-xs leading-relaxed text-muted-foreground">
                                    {detail}
                                  </p>
                                )}

                                {/* Quick info grid */}
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <GraduationCap className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{student.academic.subjects.slice(0, 2).join(', ')}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <MapPin className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{student.personal.schoolCity}, {student.personal.schoolCountry}</span>
                                  </div>
                                </div>

                                {/* Matches mini-row */}
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-muted-foreground">
                                    {student.matches.length} match{student.matches.length !== 1 ? 'es' : ''}
                                  </span>
                                  <span className="text-border">·</span>
                                  <span className="text-muted-foreground">
                                    {student.applications.length} application{student.applications.length !== 1 ? 's' : ''}
                                  </span>
                                  <span className="text-border">·</span>
                                  <span className="text-muted-foreground">
                                    {student.profile.completionPct}% profile
                                  </span>
                                </div>

                                {/* View profile link */}
                                <Link
                                  href={`/counsellor/students/${student.id}`}
                                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover-lift"
                                >
                                  View full profile
                                  <ArrowUpRight className="h-3 w-3" />
                                </Link>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
};
