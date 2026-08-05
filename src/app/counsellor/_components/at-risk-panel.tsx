'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, FileX, Clock, UserX, ChevronRight, Timer } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { ShowMoreToggle } from '@/components/ui/show-more-toggle';
import { stagger, cardFade } from '@/lib/motion';
import type { AtRiskAlert, RiskType, RiskUrgency } from '@/lib/counsellor/types';

const RISK_CONFIG: Record<RiskType, { icon: typeof AlertTriangle; label: string; color: string; bg: string }> = {
  essay_not_started: { icon: FileX, label: 'Essay not started', color: 'text-danger', bg: 'bg-danger-subtle' },
  missing_documents: { icon: FileX, label: 'Missing documents', color: 'text-warning', bg: 'bg-warning-subtle' },
  stalled_application: { icon: Clock, label: 'Stalled application', color: 'text-warning', bg: 'bg-warning-subtle' },
  low_completion: { icon: UserX, label: 'Low completion', color: 'text-danger', bg: 'bg-danger-subtle' },
  deadline_approaching: { icon: Timer, label: 'Deadline approaching', color: 'text-danger', bg: 'bg-danger-subtle' },
};

const URGENCY_CONFIG: Record<RiskUrgency, { color: string; bg: string; label: string }> = {
  critical: { color: 'text-danger', bg: 'bg-danger-fill', label: 'Critical' },
  high: { color: 'text-warning', bg: 'bg-warning-fill', label: 'High' },
  medium: { color: 'text-muted-foreground', bg: 'bg-muted-foreground', label: 'Medium' },
};

interface AtRiskPanelProps {
  alerts: AtRiskAlert[];
}

const URGENCY_ORDER: Record<RiskUrgency, number> = { critical: 0, high: 1, medium: 2 };
const COLLAPSED_COUNT = 5;

export function AtRiskPanel({ alerts }: AtRiskPanelProps) {
  const [urgencyFilter, setUrgencyFilter] = useState<RiskUrgency | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Sort by urgency (critical → high → medium), stable within a tier, on the
  // full list before filtering.
  const sorted = [...alerts].sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency]);
  const filtered = urgencyFilter ? sorted.filter((a) => a.urgency === urgencyFilter) : sorted;
  const visible = expanded ? filtered : filtered.slice(0, COLLAPSED_COUNT);
  const counts: Record<RiskUrgency, number> = { critical: 0, high: 0, medium: 0 };
  alerts.forEach((a) => counts[a.urgency]++);

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-success">
        All students are on track. No at-risk flags detected.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setUrgencyFilter(null)}
          className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', !urgencyFilter ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted')}
        >
          All ({alerts.length})
        </button>
        {(['critical', 'high', 'medium'] as const).map((u) => {
          if (counts[u] === 0) return null;
          const cfg = URGENCY_CONFIG[u];
          return (
            <button
              key={u}
              onClick={() => setUrgencyFilter(urgencyFilter === u ? null : u)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                urgencyFilter === u ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted'
              )}
            >
              <span className={cn('inline-block h-1.5 w-1.5 rounded-full mr-1.5', cfg.bg)} />
              {cfg.label} ({counts[u]})
            </button>
          );
        })}
      </div>

      {/* Alert list */}
      <motion.div className="space-y-2" variants={stagger} initial="hidden" animate="show">
        <AnimatePresence mode="popLayout">
          {visible.map((alert) => {
            const risk = RISK_CONFIG[alert.riskType];
            const urgency = URGENCY_CONFIG[alert.urgency];
            const Icon = risk.icon;
            return (
              <motion.div key={`${alert.studentId}-${alert.riskType}`} variants={cardFade} exit={{ opacity: 0, scale: 0.95 }} layout>
                <Link
                  href={`/counsellor/students/${alert.studentId}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:bg-muted/30 group"
                >
                  {/* Urgency dot */}
                  <div className={cn('h-2.5 w-2.5 rounded-full shrink-0', urgency.bg)} />

                  {/* Risk icon — the box holds layout only; the risk TYPE is a
                      category, so it is named by the chip below, not by a tint here. */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{alert.flagEmoji}</span>
                      <span className="text-sm font-semibold text-foreground">{alert.studentName}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-label font-semibold', risk.bg, risk.color)}>{risk.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{alert.description}</p>
                    <p className="text-label text-muted-foreground/70 mt-0.5">{alert.suggestedAction}</p>
                  </div>

                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-[color,transform] shrink-0" />
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>

      {filtered.length > COLLAPSED_COUNT && (
        <ShowMoreToggle
          expanded={expanded}
          onToggle={() => setExpanded((prev) => !prev)}
          total={filtered.length}
          noun="alerts"
        />
      )}
    </div>
  );
}
