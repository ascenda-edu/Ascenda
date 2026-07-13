'use client';

import { useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  PieChart, BarChart2, TrendingUp, CheckCircle, Target, Users
} from 'lucide-react';
import { PageHero } from '@/components/layout/page-hero';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import type { CohortStats } from '@/lib/counsellor/data';
import {
  ProgrammeSplit,
  IbDistribution,
  FieldChart,
  FullFunnel,
  MatchTierSummary,
  CompletionBreakdown
} from './_components/analytics-charts';
import { ExportButton } from './_components/export-button';
import {
  AnalyticsWidgetGrid,
  AnalyticsWidget
} from './_components/analytics-widget-grid';
import type { AnalyticsWidgetId, AnalyticsDragHandlers } from './_components/analytics-widget-grid';
import { DrilldownPanel } from './_components/analytics-drilldown';
import type { DrilldownState, DrilldownItem } from './_components/analytics-drilldown';

const WIDGET_ICON_MAP: Record<AnalyticsWidgetId, typeof BarChart2> = {
  programmeSplit: PieChart,
  ibDistribution: BarChart2,
  fieldChart: Target,
  completionBreakdown: CheckCircle,
  fullFunnel: TrendingUp,
  matchTierSummary: Users,
  insights: BarChart2
};

const WIDGET_META: Record<AnalyticsWidgetId, { title: string; description: string }> = {
  programmeSplit: { title: 'Programme Type Split', description: 'IB vs A-Level breakdown' },
  ibDistribution: { title: 'IB Score Distribution', description: 'Score brackets across IB students' },
  fieldChart: { title: 'Fields of Interest', description: 'Subject area distribution' },
  completionBreakdown: { title: 'Profile Completion', description: 'Completion rate by bucket' },
  fullFunnel: { title: 'Applications by stage', description: 'Stage-by-stage breakdown across the cohort' },
  matchTierSummary: { title: 'Match Distribution', description: 'Reach / Match / Safe across cohort' },
  insights: { title: 'Key Insights', description: 'Cohort takeaways at a glance' }
};

const STAGE_TO_STATUS: Record<keyof CohortStats['appFunnel'], string> = {
  planning: 'planning',
  inProgress: 'in_progress',
  submitted: 'submitted',
  decision: 'decision'
};

interface AnalyticsClientProps {
  students: CounsellorStudent[];
  stats: CohortStats;
  fieldDistribution: { key: string; label: string; count: number }[];
}

export function AnalyticsClient({ students, stats, fieldDistribution }: AnalyticsClientProps) {
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const closeDrilldown = useCallback(() => setDrilldown(null), []);

  const ibStudents = students.filter((s) => s.academic.programmeType === 'IB');
  const ibBuckets = [
    { label: '41–45', count: ibStudents.filter((s) => (s.academic.ibPoints ?? 0) >= 41).length, min: 41, max: 45 },
    { label: '38–40', count: ibStudents.filter((s) => (s.academic.ibPoints ?? 0) >= 38 && (s.academic.ibPoints ?? 0) <= 40).length, min: 38, max: 40 },
    { label: '35–37', count: ibStudents.filter((s) => (s.academic.ibPoints ?? 0) >= 35 && (s.academic.ibPoints ?? 0) <= 37).length, min: 35, max: 37 },
    { label: '30–34', count: ibStudents.filter((s) => (s.academic.ibPoints ?? 0) < 35 && (s.academic.ibPoints ?? 0) >= 30).length, min: 30, max: 34 }
  ];
  const completionData = students.map((s) => ({
    name: `${s.personal.firstName} ${s.personal.lastName}`,
    pct: s.profile.completionPct
  }));
  const totalMatches = students.reduce((acc, s) => acc + s.matches.length, 0);
  const totalApps = students.reduce((acc, s) => acc + s.applications.length, 0);
  const totalSubmittedApps = students.reduce((acc, s) => acc + s.applications.filter((a) => a.status === 'submitted').length, 0);
  const totalReachMatches = students.reduce((acc, s) => acc + s.matches.filter((m) => m.tier === 'Reach').length, 0);
  const safeCoverageCount = students.filter((s) => s.matches.some((m) => m.tier === 'Safe')).length;

  const handleProgrammeSelect = (programme: 'IB' | 'A_LEVEL') => {
    const label = programme === 'IB' ? 'IB' : 'A-Level';
    const group = students.filter((s) => s.academic.programmeType === programme);
    const avgCompletion = Math.round(group.reduce((a, s) => a + s.profile.completionPct, 0) / (group.length || 1));
    const totalAppsForGroup = group.reduce((a, s) => a + s.applications.length, 0);
    setDrilldown({
      title: `${label} Students`,
      subtitle: `${group.length} student${group.length !== 1 ? 's' : ''} enrolled in the ${label} programme`,
      accentColor: programme === 'IB' ? 'bg-violet-500' : 'bg-sky-500',
      summaryStats: [
        { label: 'students', value: String(group.length) },
        { label: 'avg completion', value: `${avgCompletion}%` },
        { label: 'applications', value: String(totalAppsForGroup) },
      ],
      items: group.map((s) => ({
        student: s,
        detail: s.academic.subjects.slice(0, 3).join(', '),
        badge: programme === 'IB' && s.academic.ibPoints
          ? { label: `${s.academic.ibPoints} pts`, color: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' }
          : s.academic.aLevelGrades
            ? { label: s.academic.aLevelGrades, color: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' }
            : undefined
      }))
    });
  };

  const handleIbSelect = (bucket: { label: string; min: number; max: number }) => {
    const group = students.filter((s) => {
      if (s.academic.programmeType !== 'IB') return false;
      const pts = s.academic.ibPoints ?? 0;
      return pts >= bucket.min && pts <= bucket.max;
    });
    const avgPts = group.length ? Math.round(group.reduce((a, s) => a + (s.academic.ibPoints ?? 0), 0) / group.length) : 0;
    setDrilldown({
      title: `IB ${bucket.label} Points`,
      subtitle: `${group.length} student${group.length !== 1 ? 's' : ''} in this score bracket`,
      accentColor: 'bg-primary',
      summaryStats: [
        { label: 'students', value: String(group.length) },
        { label: 'avg score', value: `${avgPts} pts` },
      ],
      items: group.map((s) => ({
        student: s,
        detail: s.academic.subjects.slice(0, 3).join(', '),
        badge: { label: `${s.academic.ibPoints} pts`, color: 'bg-primary/10 text-primary' }
      }))
    });
  };

  const handleFieldSelect = (field: { key: string; label: string }) => {
    const group = students.filter((s) => s.academic.clusters.includes(field.key));
    const ibCount = group.filter((s) => s.academic.programmeType === 'IB').length;
    setDrilldown({
      title: field.label,
      subtitle: `${group.length} student${group.length !== 1 ? 's' : ''} interested in this field`,
      accentColor: 'bg-violet-500',
      summaryStats: [
        { label: 'students', value: String(group.length) },
        { label: 'IB', value: String(ibCount) },
        { label: 'A-Level', value: String(group.length - ibCount) },
      ],
      items: group.map((s) => ({
        student: s,
        detail: s.academic.careerAspiration,
        badge: { label: s.academic.programmeType === 'IB' ? 'IB' : 'A-Level', color: s.academic.programmeType === 'IB' ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' : 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' }
      }))
    });
  };

  const handleFunnelSelect = (stage: keyof CohortStats['appFunnel'], label: string) => {
    const statusKey = STAGE_TO_STATUS[stage];
    const items: DrilldownItem[] = [];
    students.forEach((s) => {
      const matchingApps = s.applications.filter((a) => a.status === statusKey);
      if (matchingApps.length > 0) {
        items.push({
          student: s,
          detail: matchingApps.map((a) => `${a.university} — ${a.program}`).join(' · '),
          badge: { label: `${matchingApps.length} app${matchingApps.length !== 1 ? 's' : ''}`, color: 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300' }
        });
      }
    });
    const stageColors: Record<string, string> = {
      planning: 'bg-muted-foreground',
      inProgress: 'bg-sky-500',
      submitted: 'bg-violet-500',
      decision: 'bg-emerald-500'
    };
    const totalAppsAtStage = items.reduce((a, item) => a + item.student.applications.filter((app) => app.status === statusKey).length, 0);
    setDrilldown({
      title: label,
      subtitle: `${items.length} student${items.length !== 1 ? 's' : ''} with applications at this stage`,
      accentColor: stageColors[stage] ?? 'bg-primary',
      summaryStats: [
        { label: 'students', value: String(items.length) },
        { label: 'applications', value: String(totalAppsAtStage) },
      ],
      items
    });
  };

  const handleTierSelect = (tier: 'reach' | 'match' | 'safe', label: string) => {
    const tierValue = label as 'Reach' | 'Match' | 'Safe';
    const items: DrilldownItem[] = [];
    students.forEach((s) => {
      const matchingMatches = s.matches.filter((m) => m.tier === tierValue);
      if (matchingMatches.length > 0) {
        items.push({
          student: s,
          detail: matchingMatches.map((m) => `${m.university} (${m.score}%)`).join(' · '),
          badge: { label: `${matchingMatches.length} match${matchingMatches.length !== 1 ? 'es' : ''}`, color: tier === 'reach' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' : tier === 'match' ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' }
        });
      }
    });
    const totalTierMatches = items.reduce((a, item) => a + item.student.matches.filter((m) => m.tier === tierValue).length, 0);
    const avgScore = items.length ? Math.round(items.reduce((a, item) => {
      const scores = item.student.matches.filter((m) => m.tier === tierValue).map((m) => m.score);
      return a + scores.reduce((x, y) => x + y, 0) / (scores.length || 1);
    }, 0) / items.length) : 0;
    setDrilldown({
      title: `${label} Tier`,
      subtitle: `${items.length} student${items.length !== 1 ? 's' : ''} with ${label}-tier matches`,
      accentColor: tier === 'reach' ? 'bg-rose-500' : tier === 'match' ? 'bg-amber-500' : 'bg-emerald-500',
      summaryStats: [
        { label: 'students', value: String(items.length) },
        { label: 'matches', value: String(totalTierMatches) },
        { label: 'avg score', value: `${avgScore}%` },
      ],
      items
    });
  };

  const handleCompletionSelect = (bucket: { label: string; min: number; max: number }) => {
    const group = students.filter((s) => s.profile.completionPct >= bucket.min && s.profile.completionPct <= bucket.max);
    const colorMap: Record<string, string> = {
      '100%': 'bg-emerald-500',
      '75–99%': 'bg-sky-500',
      '50–74%': 'bg-amber-500',
      '<50%': 'bg-red-500'
    };
    const badgeColorMap: Record<string, string> = {
      '100%': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
      '75–99%': 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300',
      '50–74%': 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
      '<50%': 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300'
    };
    const avgPct = group.length ? Math.round(group.reduce((a, s) => a + s.profile.completionPct, 0) / group.length) : 0;
    setDrilldown({
      title: `${bucket.label} Complete`,
      subtitle: `${group.length} student${group.length !== 1 ? 's' : ''} in this completion range`,
      accentColor: colorMap[bucket.label] ?? 'bg-primary',
      summaryStats: [
        { label: 'students', value: String(group.length) },
        { label: 'avg completion', value: `${avgPct}%` },
      ],
      items: group.map((s) => ({
        student: s,
        detail: `Missing: ${['personal', 'academic', 'subjects', 'lifestyle'].filter((step) => !s.profile.stepsComplete.includes(step as any)).join(', ') || 'None'}`,
        badge: { label: `${s.profile.completionPct}%`, color: badgeColorMap[bucket.label] ?? 'bg-primary/10 text-primary' }
      }))
    });
  };

  const handleInsightClick = (key: string) => {
    switch (key) {
      case 'profile_gaps': {
        const group = students.filter((s) => s.flags.includes('profile_incomplete') || s.profile.completionPct < 100);
        setDrilldown({
          title: 'Profile Gaps',
          subtitle: `${group.length} student${group.length !== 1 ? 's' : ''} with incomplete profiles`,
          accentColor: 'bg-amber-500',
          items: group.map((s) => ({
            student: s,
            detail: `${s.profile.completionPct}% complete — missing: ${['personal', 'academic', 'subjects', 'lifestyle'].filter((step) => !s.profile.stepsComplete.includes(step as any)).join(', ') || 'flags only'}`,
            badge: { label: `${s.profile.completionPct}%`, color: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300' }
          }))
        });
        break;
      }
      case 'top_destination': {
        const group = students.filter((s) => s.matches.some((m) => m.country === 'UK') || s.applications.some((a) => a.country === 'UK'));
        setDrilldown({
          title: 'UK-Bound Students',
          subtitle: `${group.length} student${group.length !== 1 ? 's' : ''} targeting the United Kingdom`,
          accentColor: 'bg-violet-500',
          items: group.map((s) => {
            const ukMatches = s.matches.filter((m) => m.country === 'UK');
            return {
              student: s,
              detail: ukMatches.map((m) => m.university).join(', '),
              badge: { label: `${ukMatches.length} UK`, color: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300' }
            };
          })
        });
        break;
      }
      case 'submission_rate': {
        const group = students.filter((s) => s.applications.some((a) => a.status === 'submitted'));
        setDrilldown({
          title: 'Submitted Applications',
          subtitle: `${group.length} student${group.length !== 1 ? 's' : ''} with submitted applications`,
          accentColor: 'bg-emerald-500',
          items: group.map((s) => {
            const submitted = s.applications.filter((a) => a.status === 'submitted');
            return {
              student: s,
              detail: submitted.map((a) => `${a.university} — ${a.program}`).join(' · '),
              badge: { label: `${submitted.length} sent`, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' }
            };
          })
        });
        break;
      }
      case 'deadlines_week': {
        const now = new Date();
        const weekFromNow = new Date(now);
        weekFromNow.setDate(weekFromNow.getDate() + 7);
        const items: DrilldownItem[] = [];
        students.forEach((s) => {
          const urgentDeadlines = s.deadlines.filter((d) => {
            const dd = new Date(d.date);
            return dd >= now && dd <= weekFromNow;
          });
          if (urgentDeadlines.length > 0) {
            items.push({
              student: s,
              detail: urgentDeadlines.map((d) => `${d.university} — ${new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`).join(' · '),
              badge: { label: `${urgentDeadlines.length} due`, color: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' }
            });
          }
        });
        setDrilldown({
          title: 'Deadlines This Week',
          subtitle: `${items.length} student${items.length !== 1 ? 's' : ''} with upcoming deadlines`,
          accentColor: 'bg-red-500',
          items
        });
        break;
      }
      case 'reach_apps': {
        const items: DrilldownItem[] = [];
        students.forEach((s) => {
          const reachMatches = s.matches.filter((m) => m.tier === 'Reach');
          if (reachMatches.length > 0) {
            items.push({
              student: s,
              detail: reachMatches.map((m) => `${m.university} (${m.score}%)`).join(' · '),
              badge: { label: `${reachMatches.length} reach`, color: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300' }
            });
          }
        });
        setDrilldown({
          title: 'Reach-Tier Matches',
          subtitle: `${items.length} student${items.length !== 1 ? 's' : ''} with Reach-tier matches`,
          accentColor: 'bg-rose-500',
          items
        });
        break;
      }
      case 'safe_coverage': {
        const withSafe = students.filter((s) => s.matches.some((m) => m.tier === 'Safe'));
        const withoutSafe = students.filter((s) => !s.matches.some((m) => m.tier === 'Safe'));
        const all = [...withoutSafe, ...withSafe];
        setDrilldown({
          title: 'Safe-Tier Coverage',
          subtitle: `${withSafe.length} of ${students.length} students have a Safe option`,
          accentColor: 'bg-sky-500',
          items: all.map((s) => {
            const hasSafe = s.matches.some((m) => m.tier === 'Safe');
            const safeMatches = s.matches.filter((m) => m.tier === 'Safe');
            return {
              student: s,
              detail: hasSafe
                ? safeMatches.map((m) => m.university).join(', ')
                : 'No Safe-tier options — consider adding safety schools',
              badge: hasSafe
                ? { label: `${safeMatches.length} safe`, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300' }
                : { label: 'At risk', color: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300' }
            };
          })
        });
        break;
      }
    }
  };

  function renderWidget(
    id: AnalyticsWidgetId,
    index: number,
    removeWidget: (id: AnalyticsWidgetId) => void,
    sizes: Record<AnalyticsWidgetId, 'normal' | 'wide'>,
    toggleSize: (id: AnalyticsWidgetId) => void,
    dragHandlers: AnalyticsDragHandlers
  ) {
    const icon = WIDGET_ICON_MAP[id];
    const meta = WIDGET_META[id];
    const size = sizes[id];

    return (
      <AnalyticsWidget
        key={id}
        id={id}
        title={meta.title}
        description={meta.description}
        icon={icon}
        onRemove={removeWidget}
        onToggleSize={toggleSize}
        size={size}
        index={index}
        dragHandlers={dragHandlers}
      >
        {id === 'programmeSplit' && <ProgrammeSplit breakdown={stats.programmeBreakdown} onSelect={handleProgrammeSelect} />}
        {id === 'ibDistribution' && <IbDistribution buckets={ibBuckets} onSelect={handleIbSelect} />}
        {id === 'fieldChart' && <FieldChart fields={fieldDistribution} onSelect={handleFieldSelect} />}
        {id === 'completionBreakdown' && <CompletionBreakdown students={completionData} onSelect={handleCompletionSelect} />}
        {id === 'fullFunnel' && <FullFunnel funnel={stats.appFunnel} onSelect={handleFunnelSelect} />}
        {id === 'matchTierSummary' && <MatchTierSummary tiers={stats.matchTiers} onSelect={handleTierSelect} />}
        {id === 'insights' && (
          <InsightsContent
            onInsightClick={handleInsightClick}
            stats={stats}
            totalApps={totalApps}
            totalSubmittedApps={totalSubmittedApps}
            totalReachMatches={totalReachMatches}
            safeCoverageCount={safeCoverageCount}
          />
        )}
      </AnalyticsWidget>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Counsellor"
        accent="Analytics"
        highlight="Deep dive"
        title="Cohort analytics"
        description="Drill into trends, cohorts, and outcomes across your roster. Use Overview for daily triage."
        actions={<ExportButton />}
        stats={[
          { label: 'Students', value: String(stats.total), detail: 'In cohort' },
          { label: 'Total Matches', value: String(totalMatches), detail: 'Across all students' },
          { label: 'Applications', value: String(totalApps), detail: 'In progress or submitted' },
          { label: 'Avg Completion', value: `${stats.avgCompletion}%`, detail: 'Profile readiness' }
        ]}
      />

      <AnalyticsWidgetGrid>
        {(visibleWidgets, removeWidget, sizes, toggleSize, dragHandlers) => (
          <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
            <AnimatePresence mode="popLayout">
              {visibleWidgets.map((id, idx) =>
                renderWidget(id, idx, removeWidget, sizes, toggleSize, dragHandlers)
              )}
            </AnimatePresence>
          </div>
        )}
      </AnalyticsWidgetGrid>

      <DrilldownPanel data={drilldown} onClose={closeDrilldown} />
    </div>
  );
}

/* ─── Insights Content (clickable) ─────────────────────────────────────────── */

function InsightsContent({
  onInsightClick,
  stats,
  totalApps,
  totalSubmittedApps,
  totalReachMatches,
  safeCoverageCount
}: {
  onInsightClick: (key: string) => void;
  stats: CohortStats;
  totalApps: number;
  totalSubmittedApps: number;
  totalReachMatches: number;
  safeCoverageCount: number;
}) {
  const insights = [
    {
      key: 'profile_gaps',
      label: 'Profile gaps',
      value: `${stats.flagged} student${stats.flagged !== 1 ? 's' : ''}`,
      detail: 'have incomplete profiles affecting match quality',
      color: 'text-amber-600',
      bg: 'bg-amber-500/10',
      border: 'border-amber-200/50 dark:border-amber-500/20',
      hoverBorder: 'hover:border-amber-300/80 dark:hover:border-amber-400/40'
    },
    {
      key: 'top_destination',
      label: 'Top destination',
      value: 'United Kingdom',
      detail: 'is the #1 preferred study destination across the cohort',
      color: 'text-violet-600',
      bg: 'bg-violet-500/10',
      border: 'border-violet-200/50 dark:border-violet-500/20',
      hoverBorder: 'hover:border-violet-300/80 dark:hover:border-violet-400/40'
    },
    {
      key: 'submission_rate',
      label: 'Submission rate',
      value: `${Math.round((totalSubmittedApps / (totalApps || 1)) * 100)}%`,
      detail: 'of all applications have been submitted',
      color: 'text-emerald-600',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-200/50 dark:border-emerald-500/20',
      hoverBorder: 'hover:border-emerald-300/80 dark:hover:border-emerald-400/40'
    },
    {
      key: 'deadlines_week',
      label: 'Deadlines this week',
      value: String(stats.deadlinesThisWeek),
      detail: `deadline${stats.deadlinesThisWeek !== 1 ? 's' : ''} require immediate attention`,
      color: 'text-red-500',
      bg: 'bg-red-500/10',
      border: 'border-red-200/50 dark:border-red-500/20',
      hoverBorder: 'hover:border-red-300/80 dark:hover:border-red-400/40'
    },
    {
      key: 'reach_apps',
      label: 'Reach applications',
      value: `${totalReachMatches}`,
      detail: 'Reach-tier matches across cohort — worth monitoring closely',
      color: 'text-rose-600',
      bg: 'bg-rose-500/10',
      border: 'border-rose-200/50 dark:border-rose-500/20',
      hoverBorder: 'hover:border-rose-300/80 dark:hover:border-rose-400/40'
    },
    {
      key: 'safe_coverage',
      label: 'Safe coverage',
      value: `${safeCoverageCount} / ${stats.total}`,
      detail: 'students have at least one Safe-tier option',
      color: 'text-sky-600',
      bg: 'bg-sky-500/10',
      border: 'border-sky-200/50 dark:border-sky-500/20',
      hoverBorder: 'hover:border-sky-300/80 dark:hover:border-sky-400/40'
    }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {insights.map(({ key, label, value, detail, color, bg, border, hoverBorder }) => (
        <button
          key={key}
          onClick={() => onInsightClick(key)}
          className={`rounded-2xl border px-4 py-4 text-left transition hover:-translate-y-0.5 hover:shadow-md cursor-pointer ${bg} ${border} ${hoverBorder}`}
        >
          <p className={`text-lg font-bold ${color}`}>{value}</p>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        </button>
      ))}
    </div>
  );
}
