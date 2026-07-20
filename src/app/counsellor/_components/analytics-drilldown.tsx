'use client';

import { useEffect, useCallback, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, GraduationCap, MapPin, ArrowUpRight, Search, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import type { CounsellorStudent } from '@/lib/counsellor/types';

// Mirrors the focusable-element query in help-thread-drawer.tsx so the modal
// traps focus with the same semantics as the shared Dialog primitive.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Reset search when modal opens/changes
  useEffect(() => {
    setSearch('');
    setExpanded(null);
  }, [data?.title]);

  // Move focus into the modal on open, restore it to the trigger on close.
  useEffect(() => {
    if (data) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      const node = modalRef.current;
      const target = node?.querySelector<HTMLElement>(FOCUSABLE) ?? node;
      target?.focus();
    } else {
      previouslyFocused.current?.focus?.();
    }
  }, [data]);

  // Trap Tab focus within the modal while it's open.
  const onTrapKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const node = modalRef.current;
    if (!node) return;
    const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null
    );
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  // Escape to close
  useEffect(() => {
    if (!data) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [data, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (data) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [data]);

  const filtered = data?.items.filter((item) => {
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
    <AnimatePresence>
      {data && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={data.title}
            tabIndex={-1}
            onKeyDown={onTrapKeyDown}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
            className="relative z-10 flex max-h-[min(85vh,720px)] w-full max-w-2xl flex-col overflow-hidden rounded-[24px] border border-border bg-background shadow-[0_24px_80px_rgba(0,0,0,0.15)] outline-none"
          >
            {/* ── Accent bar ──────────────────────────────────────────────────── */}
            <div className={cn('h-1 w-full', data.accentColor)} />

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="flex items-start gap-4 px-6 pt-5 pb-4">
              <div className="min-w-0 flex-1">
                <p className="text-xl font-bold text-foreground leading-tight">{data.title}</p>
                {data.subtitle && (
                  <p className="mt-1 text-sm text-muted-foreground">{data.subtitle}</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/70 hover:text-foreground"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* ── Summary stats row ───────────────────────────────────────────── */}
            {data.summaryStats && data.summaryStats.length > 0 && (
              <div className="mx-6 mb-4 flex gap-2 overflow-x-auto">
                {data.summaryStats.map((stat) => (
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
            {data.items.length > 3 && (
              <div className="mx-6 mb-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search students..."
                    className="w-full rounded-xl border border-border bg-muted/30 py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
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
              <p className="text-[0.6875rem] font-medium uppercase tracking-widest text-muted-foreground">
                {filtered.length === data.items.length
                  ? `${data.items.length} student${data.items.length !== 1 ? 's' : ''}`
                  : `${filtered.length} of ${data.items.length} students`
                }
              </p>
            </div>

            {/* ── Student list ────────────────────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto px-6 pb-5">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50 mb-3">
                    <Search className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No students found</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {search ? 'Try a different search term' : 'No students match this filter'}
                  </p>
                </div>
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
                              ? 'bg-muted/60 shadow-sm'
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
                                <span className={cn(
                                  'shrink-0 rounded-full px-2 py-0.5 text-[0.625rem] font-bold',
                                  badge.color
                                )}>
                                  {badge.label}
                                </span>
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
                                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition hover:-translate-y-0.5 hover:shadow-md"
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
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
