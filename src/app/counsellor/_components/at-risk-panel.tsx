'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, FileX, Clock, UserX, ChevronRight, Timer } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { stagger, cardFade } from '@/lib/motion';
import type { AtRiskAlert, RiskType, RiskUrgency } from '@/lib/counsellor/types';

const RISK_CONFIG: Record<RiskType, { icon: typeof AlertTriangle; label: string; color: string; bg: string }> = {
  essay_not_started: { icon: FileX, label: 'Essay not started', color: 'text-rose-600', bg: 'bg-rose-500/10' },
  missing_documents: { icon: FileX, label: 'Missing documents', color: 'text-amber-600', bg: 'bg-amber-500/10' },
  stalled_application: { icon: Clock, label: 'Stalled application', color: 'text-amber-600', bg: 'bg-amber-500/10' },
  low_completion: { icon: UserX, label: 'Low completion', color: 'text-rose-600', bg: 'bg-rose-500/10' },
  deadline_approaching: { icon: Timer, label: 'Deadline approaching', color: 'text-rose-600', bg: 'bg-rose-500/10' },
};

const URGENCY_CONFIG: Record<RiskUrgency, { color: string; bg: string; label: string }> = {
  critical: { color: 'text-rose-600', bg: 'bg-rose-500', label: 'Critical' },
  high: { color: 'text-amber-600', bg: 'bg-amber-500', label: 'High' },
  medium: { color: 'text-sky-600', bg: 'bg-sky-500', label: 'Medium' },
};

interface AtRiskPanelProps {
  alerts: AtRiskAlert[];
}

export function AtRiskPanel({ alerts }: AtRiskPanelProps) {
  const [urgencyFilter, setUrgencyFilter] = useState<RiskUrgency | null>(null);

  const filtered = urgencyFilter ? alerts.filter((a) => a.urgency === urgencyFilter) : alerts;
  const counts: Record<RiskUrgency, number> = { critical: 0, high: 0, medium: 0 };
  alerts.forEach((a) => counts[a.urgency]++);

  if (alerts.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-emerald-200/60 bg-emerald-500/5 p-6 text-center text-sm text-emerald-600">
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
          {filtered.map((alert) => {
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

                  {/* Risk icon */}
                  <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', risk.bg)}>
                    <Icon className={cn('h-4 w-4', risk.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">{alert.flagEmoji}</span>
                      <span className="text-sm font-semibold text-foreground">{alert.studentName}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', risk.bg, risk.color)}>{risk.label}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{alert.description}</p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">{alert.suggestedAction}</p>
                  </div>

                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all shrink-0" />
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
