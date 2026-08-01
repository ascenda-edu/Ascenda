'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Clock, AlertTriangle, Minus, ChevronDown, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stagger, cardFade } from '@/lib/motion';
import type { RequirementRow, RequirementStatus, RequirementCategory } from '@/lib/data/student-demo-data';

const STATUS_CONFIG: Record<RequirementStatus, { icon: typeof CheckCircle2; color: string; bg: string; label: string; ring: string }> = {
  'complete': { icon: CheckCircle2, color: 'text-success', bg: 'bg-success-subtle', label: 'Complete', ring: 'stroke-success' },
  'in-progress': { icon: Clock, color: 'text-info', bg: 'bg-info-subtle', label: 'In progress', ring: 'stroke-info' },
  'missing': { icon: AlertTriangle, color: 'text-danger', bg: 'bg-danger-subtle', label: 'Missing', ring: 'stroke-danger' },
  'not-required': { icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted/30', label: 'N/A', ring: 'stroke-muted-foreground' },
};

const STATUS_CYCLE: RequirementStatus[] = ['missing', 'in-progress', 'complete', 'not-required'];

const CATEGORY_LABELS: Record<RequirementCategory, string> = {
  subjects: 'Subjects',
  exams: 'Exams',
  interviews: 'Interviews',
  documents: 'Documents',
  essays: 'Essays',
};

function computeProgress(cells: { status: RequirementStatus }[]): number {
  const applicable = cells.filter((c) => c.status !== 'not-required');
  if (applicable.length === 0) return 100;
  const done = applicable.filter((c) => c.status === 'complete').length;
  const partial = applicable.filter((c) => c.status === 'in-progress').length;
  return Math.round(((done + partial * 0.5) / applicable.length) * 100);
}

interface RequirementsCheckerProps {
  matrix: RequirementRow[];
}

export function RequirementsChecker({ matrix: initialMatrix }: RequirementsCheckerProps) {
  const [matrix, setMatrix] = useState<RequirementRow[]>(initialMatrix);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modified, setModified] = useState(false);

  // Load saved overrides
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ascenda-requirements');
      if (saved) {
        setMatrix(JSON.parse(saved));
        setModified(true);
      }
    } catch { /* ignore */ }
  }, []);

  const saveMatrix = (next: RequirementRow[]) => {
    setMatrix(next);
    setModified(true);
    localStorage.setItem('ascenda-requirements', JSON.stringify(next));
  };

  const resetMatrix = () => {
    setMatrix(initialMatrix);
    setModified(false);
    localStorage.removeItem('ascenda-requirements');
  };

  const cycleStatus = (rowId: string, category: RequirementCategory) => {
    const next = matrix.map((row) => {
      if (row.id !== rowId) return row;
      const updatedCells = row.cells.map((cell) => {
        if (cell.category !== category) return cell;
        const idx = STATUS_CYCLE.indexOf(cell.status);
        return { ...cell, status: STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length] };
      });
      return { ...row, cells: updatedCells, progress: computeProgress(updatedCells) };
    });
    saveMatrix(next);
  };

  const avgProgress = matrix.length ? Math.round(matrix.reduce((sum, r) => sum + r.progress, 0) / matrix.length) : 0;
  const completedUnis = matrix.filter((r) => r.progress === 100).length;
  const categories: RequirementCategory[] = ['subjects', 'exams', 'interviews', 'documents', 'essays'];

  // Category completion rates
  const categoryRates = categories.map((cat) => {
    const cells = matrix.flatMap((r) => r.cells.filter((c) => c.category === cat && c.status !== 'not-required'));
    const done = cells.filter((c) => c.status === 'complete').length;
    return { category: cat, rate: cells.length > 0 ? Math.round((done / cells.length) * 100) : 100 };
  });

  const circumference = 2 * Math.PI * 36;

  return (
    <div className="space-y-6">
      {/* Overall progress ring + stats */}
      <div className="flex flex-col sm:flex-row items-center gap-6 surface-subcard p-5 rounded-2xl">
        {/* Big progress ring */}
        <div className="relative h-28 w-28 shrink-0">
          <svg className="h-28 w-28 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/20" />
            <motion.circle
              cx="40" cy="40" r="36" fill="none" strokeWidth="5" strokeLinecap="round"
              className={cn(avgProgress >= 80 ? 'stroke-success' : avgProgress >= 50 ? 'stroke-warning' : 'stroke-danger')}
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray: `${(avgProgress / 100) * circumference} ${circumference}` }}
              transition={{ duration: 1, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              key={avgProgress}
              initial={{ scale: 1.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={cn('text-2xl font-bold', avgProgress >= 80 ? 'text-success' : avgProgress >= 50 ? 'text-warning' : 'text-danger')}
            >
              {avgProgress}%
            </motion.span>
            <span className="text-label text-muted-foreground">Overall</span>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Overall Readiness</p>
              <p className="text-xs text-muted-foreground">{completedUnis} of {matrix.length} universities fully ready</p>
            </div>
            {modified && (
              <button
                onClick={resetMatrix}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-colors"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            )}
          </div>

          {/* Category mini-bars */}
          <div className="grid grid-cols-5 gap-2">
            {categoryRates.map(({ category, rate }) => (
              <div key={category} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-label font-medium text-muted-foreground">{CATEGORY_LABELS[category]}</span>
                  <span className="text-label font-semibold text-foreground">{rate}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted/30 overflow-hidden">
                  <motion.div
                    className={cn('h-full rounded-full', rate >= 80 ? 'bg-success-fill' : rate >= 50 ? 'bg-warning-fill' : 'bg-danger-fill')}
                    initial={{ width: 0 }}
                    animate={{ width: `${rate}%` }}
                    transition={{ duration: 0.6 }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Interactive note */}
      <p className="text-label text-muted-foreground/70 italic">Click any status icon to cycle through: Missing → In Progress → Complete → N/A. Your changes are saved automatically.</p>

      {/* Desktop: interactive table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="eyebrow text-left py-3 pr-4">University</th>
              {categories.map((cat) => (
                <th key={cat} className="eyebrow text-center px-3 py-3">{CATEGORY_LABELS[cat]}</th>
              ))}
              <th className="eyebrow text-center px-3 py-3">Progress</th>
            </tr>
          </thead>
          <tbody>
            {matrix.map((row) => (
              <tr key={row.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{row.flagEmoji}</span>
                    <div>
                      <p className="font-medium text-foreground">{row.university}</p>
                      <p className="text-xs text-muted-foreground">{row.programme}</p>
                    </div>
                  </div>
                </td>
                {row.cells.map((cell) => {
                  const cfg = STATUS_CONFIG[cell.status];
                  const Icon = cfg.icon;
                  return (
                    <td key={cell.category} className="text-center px-3 py-3">
                      <button
                        onClick={() => cycleStatus(row.id, cell.category)}
                        className={cn(
                          'mx-auto flex h-9 w-9 items-center justify-center rounded-xl transition-[transform,box-shadow] hover:scale-110 hover:shadow-e-2',
                          cfg.bg
                        )}
                        aria-label={`${row.university} — ${CATEGORY_LABELS[cell.category]}: ${cfg.label}. Click to change status.`}
                        title={`${CATEGORY_LABELS[cell.category]}: ${cfg.label}${cell.detail ? ` — ${cell.detail}` : ''}. Click to change.`}
                      >
                        <Icon className={cn('h-4 w-4', cfg.color)} />
                      </button>
                    </td>
                  );
                })}
                <td className="text-center px-3 py-3">
                  <div className="flex items-center justify-center gap-2">
                    {/* Mini ring */}
                    <div className="relative h-9 w-9">
                      <svg className="h-9 w-9 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/20" />
                        <motion.circle
                          cx="18" cy="18" r="14" fill="none" strokeWidth="2.5" strokeLinecap="round"
                          className={cn(row.progress >= 80 ? 'stroke-success' : row.progress >= 50 ? 'stroke-warning' : 'stroke-danger')}
                          animate={{ strokeDasharray: `${(row.progress / 100) * 2 * Math.PI * 14} ${2 * Math.PI * 14}` }}
                          transition={{ duration: 0.5 }}
                        />
                      </svg>
                      <span className={cn(
                        'absolute inset-0 flex items-center justify-center text-label font-bold',
                        row.progress >= 80 ? 'text-success' : row.progress >= 50 ? 'text-warning' : 'text-danger'
                      )}>
                        {row.progress}
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: expandable cards */}
      <motion.div className="md:hidden space-y-3" variants={stagger} initial="hidden" animate="show">
        {matrix.map((row) => {
          const isExpanded = expandedId === row.id;
          return (
            <motion.div key={row.id} variants={cardFade}>
              <div className="surface-subcard rounded-2xl overflow-hidden">
                {/* The expand toggle and the per-status buttons are SIBLINGS, not
                    nested. This whole header used to be one <button> with the status
                    buttons inside it — invalid HTML (a button can't contain a button),
                    which React reports as a hydration error, and the reason those
                    handlers needed an e.stopPropagation() to work at all. */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : row.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`req-panel-${row.id}`}
                  className="w-full p-4 pb-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{row.flagEmoji}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{row.university}</p>
                        <p className="text-xs text-muted-foreground">{row.programme}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Mini ring */}
                      <div className="relative h-10 w-10">
                        <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="14" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/20" />
                          <motion.circle
                            cx="18" cy="18" r="14" fill="none" strokeWidth="2.5" strokeLinecap="round"
                            className={cn(row.progress >= 80 ? 'stroke-success' : row.progress >= 50 ? 'stroke-warning' : 'stroke-danger')}
                            animate={{ strokeDasharray: `${(row.progress / 100) * 2 * Math.PI * 14} ${2 * Math.PI * 14}` }}
                            transition={{ duration: 0.5 }}
                          />
                        </svg>
                        <span className={cn(
                          'absolute inset-0 flex items-center justify-center text-label font-bold',
                          row.progress >= 80 ? 'text-success' : row.progress >= 50 ? 'text-warning' : 'text-danger'
                        )}>
                          {row.progress}%
                        </span>
                      </div>
                      <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
                    </div>
                  </div>

                </button>

                {/* Status icons row — a sibling of the toggle, so no nesting and no
                    stopPropagation needed. */}
                <div className="flex gap-2 px-4 pb-4 pt-3">
                  {row.cells.map((cell) => {
                    const cfg = STATUS_CONFIG[cell.status];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={cell.category}
                        type="button"
                        onClick={() => cycleStatus(row.id, cell.category)}
                        className={cn('flex h-8 w-8 items-center justify-center rounded-lg transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background', cfg.bg)}
                        aria-label={`${CATEGORY_LABELS[cell.category]}: ${cfg.label}. Click to change status.`}
                        title={`${CATEGORY_LABELS[cell.category]}: ${cfg.label}`}
                      >
                        <Icon className={cn('h-3.5 w-3.5', cfg.color)} />
                      </button>
                    );
                  })}
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div id={`req-panel-${row.id}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="px-4 pb-4 space-y-2 border-t border-border/50 pt-3">
                        {row.cells.map((cell) => {
                          const cfg = STATUS_CONFIG[cell.status];
                          return (
                            <div key={cell.category} className="flex items-start gap-3">
                              <button
                                onClick={() => cycleStatus(row.id, cell.category)}
                                aria-label={`${CATEGORY_LABELS[cell.category]}: ${cfg.label}. Click to change status.`}
                                className={cn('flex h-6 w-6 items-center justify-center rounded-md shrink-0', cfg.bg)}
                              >
                                {(() => { const Icon = cfg.icon; return <Icon className={cn('h-3 w-3', cfg.color)} />; })()}
                              </button>
                              <div>
                                <span className="text-xs font-semibold text-foreground">{CATEGORY_LABELS[cell.category]}</span>
                                {cell.detail && <p className="text-xs text-muted-foreground">{cell.detail}</p>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
