'use client';

import { useState, useCallback, useMemo } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  PieChart, BarChart2, TrendingUp, CheckCircle, Target, Users, Sparkles
} from 'lucide-react';
import { PageHero } from '@/components/layout/page-hero';
import { daysUntil, parseLocalDate } from '@/lib/utils/dates';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import type { CohortStats } from '@/lib/counsellor/data';
import { STAGE_COLORS, FUNNEL_STAGE_TO_STATUS, type FunnelStage } from '@/lib/counsellor/stage-colors';
import { TIER_VISUAL } from '@/lib/theme/categories';
import { CHART_ACCENT, CHART_SERIES, chartPaletteAt } from './_components/chart-palette';
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
  AnalyticsWidget,
  isCustomWidgetId
} from './_components/analytics-widget-grid';
import type { AnalyticsWidgetId, AnalyticsWidgetKey, AnalyticsWidgetSizes, AnalyticsDragHandlers } from './_components/analytics-widget-grid';
import { DrilldownPanel } from './_components/analytics-drilldown';
import type { DrilldownState, DrilldownItem } from './_components/analytics-drilldown';
import { CustomWidgetChart } from './_components/custom-widget-chart';
import { CustomWidgetBuilder } from './_components/custom-widget-builder';
import { useCustomWidgets } from './_components/use-custom-widgets';
import {
  describeCustomWidget,
  getCustomWidgetSourceMeta,
  type CustomWidgetBucket,
  type CustomWidgetDef
} from '@/lib/counsellor/custom-widgets';

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

// Stage → status translation is FUNNEL_STAGE_TO_STATUS (lib/counsellor/stage-colors),
// the one exhaustive mapping. The private copy that lived here omitted `enrolled`.

interface AnalyticsClientProps {
  students: CounsellorStudent[];
  stats: CohortStats;
  fieldDistribution: { key: string; label: string; count: number }[];
}

export function AnalyticsClient({ students, stats, fieldDistribution }: AnalyticsClientProps) {
  const [drilldown, setDrilldown] = useState<DrilldownState | null>(null);
  const closeDrilldown = useCallback(() => setDrilldown(null), []);

  const { customWidgets, addCustomWidget, deleteCustomWidget } = useCustomWidgets();
  const [builderOpen, setBuilderOpen] = useState(false);
  const customWidgetById = useMemo(
    () => new Map(customWidgets.map((def) => [def.id, def])),
    [customWidgets]
  );
  const customEntries = useMemo(
    () => customWidgets.map((def) => ({ id: def.id, label: def.title, description: describeCustomWidget(def) })),
    [customWidgets]
  );

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
      // Ramp steps 1 and 4 — the two segments `ProgrammeSplit` actually paints.
      // This used to be feature/info, so clicking the indigo IB segment opened a
      // violet-accented drill-down and the A-Level one turned blue.
      accentColor: programme === 'IB' ? CHART_SERIES[0].bar : CHART_SERIES[3].bar,
      summaryStats: [
        { label: 'students', value: String(group.length) },
        { label: 'avg completion', value: `${avgCompletion}%` },
        { label: 'applications', value: String(totalAppsForGroup) },
      ],
      items: group.map((s) => ({
        student: s,
        detail: s.academic.subjects.slice(0, 3).join(', '),
        badge: programme === 'IB' && s.academic.ibPoints
          ? { label: `${s.academic.ibPoints} pts`, color: 'bg-primary/10 text-primary-ink' }
          : s.academic.aLevelGrades
            ? { label: s.academic.aLevelGrades, color: 'bg-muted text-muted-foreground' }
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
        badge: { label: `${s.academic.ibPoints} pts`, color: 'bg-primary/10 text-primary-ink' }
      }))
    });
  };

  const handleFieldSelect = (field: { key: string; label: string }) => {
    const group = students.filter((s) => s.academic.clusters.includes(field.key));
    const ibCount = group.filter((s) => s.academic.programmeType === 'IB').length;
    setDrilldown({
      title: field.label,
      subtitle: `${group.length} student${group.length !== 1 ? 's' : ''} interested in this field`,
      // `FieldChart` paints every row with the single bar accent, so the
      // drill-down wears it too. It was `bg-feature-fill`, which made all ten
      // indigo rows open a violet panel.
      accentColor: CHART_ACCENT.bar,
      summaryStats: [
        { label: 'students', value: String(group.length) },
        { label: 'IB', value: String(ibCount) },
        { label: 'A-Level', value: String(group.length - ibCount) },
      ],
      items: group.map((s) => ({
        student: s,
        detail: s.academic.careerAspiration,
        badge: { label: s.academic.programmeType === 'IB' ? 'IB' : 'A-Level', color: s.academic.programmeType === 'IB' ? 'bg-primary/10 text-primary-ink' : 'bg-muted text-muted-foreground' }
      }))
    });
  };

  const handleFunnelSelect = (stage: FunnelStage, label: string) => {
    const statusKey = FUNNEL_STAGE_TO_STATUS[stage];
    const items: DrilldownItem[] = [];
    students.forEach((s) => {
      const matchingApps = s.applications.filter((a) => a.status === statusKey);
      if (matchingApps.length > 0) {
        items.push({
          student: s,
          detail: matchingApps.map((a) => `${a.university} — ${a.program}`).join(' · '),
          badge: { label: `${matchingApps.length} app${matchingApps.length !== 1 ? 's' : ''}`, color: 'bg-muted text-muted-foreground' }
        });
      }
    });
    // Share the single stage-colour source so the funnel accent matches the
    // Applications view. Keyed by funnel-stage name → ApplicationStatus.
    const accent = STAGE_COLORS[statusKey].accent;
    const totalAppsAtStage = items.reduce((a, item) => a + item.student.applications.filter((app) => app.status === statusKey).length, 0);
    setDrilldown({
      title: label,
      subtitle: `${items.length} student${items.length !== 1 ? 's' : ''} with applications at this stage`,
      accentColor: accent,
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
          badge: { label: `${matchingMatches.length} match${matchingMatches.length !== 1 ? 'es' : ''}`, color: tier === 'reach' ? 'bg-danger-subtle text-danger' : tier === 'match' ? 'bg-warning-subtle text-warning' : 'bg-success-subtle text-success' }
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
      accentColor: tier === 'reach' ? TIER_VISUAL.reach.bar : tier === 'match' ? TIER_VISUAL.match.bar : TIER_VISUAL.safety.bar,
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
    // Four ORDINAL slots on one axis (how much of a profile is filled in), which
    // is precisely what the monochrome series ramp is for — so this walks
    // `chartPaletteAt` like every other segmented mark in the analytics, instead
    // of spending four status hues on a quantity. It used to read the bands out of
    // COMPLETION_VISUAL, which was the right instinct (one source for the
    // thresholds) applied to the wrong table: those bands no longer carry a hue at
    // all, so all four buckets would now come back brand-or-grey and the ordering
    // would vanish.
    //
    // Index by COMPLETION MAGNITUDE, not by the bucket's position in the list the
    // chart happens to print (which runs 100% → <50%, i.e. backwards). chart-palette
    // is explicit that ramp order is meaningful — light→dark reads small→large — so
    // `<50%` takes step 1 and `100%` step 4. Keep this in step with the bar colours
    // in `CompletionBreakdown` (_components/analytics-charts.tsx); the accent bar on
    // this panel is meant to be the same colour as the bar the user just clicked.
    const RAMP_INDEX_BY_BUCKET: Record<string, number> = {
      '<50%': 0,
      '50–74%': 1,
      '75–99%': 2,
      '100%': 3
    };
    const rampIndex = RAMP_INDEX_BY_BUCKET[bucket.label];
    const accent = rampIndex === undefined ? CHART_ACCENT : chartPaletteAt(rampIndex);
    // The badge is NOT tinted per bucket. `CHART_SERIES` sets `text` to
    // `text-foreground` on every step deliberately: no ramp step clears 4.5:1 as
    // text across these surfaces (`text-series-4` measures 4.11:1 in light and
    // fails outright), so the ramp lives on marks and never on type. And there is
    // nothing left for a tint to say here — the panel title is already
    // "<50% Complete" and the badge prints the student's own percentage.
    const avgPct = group.length ? Math.round(group.reduce((a, s) => a + s.profile.completionPct, 0) / group.length) : 0;
    setDrilldown({
      title: `${bucket.label} Complete`,
      subtitle: `${group.length} student${group.length !== 1 ? 's' : ''} in this completion range`,
      accentColor: accent.bar,
      summaryStats: [
        { label: 'students', value: String(group.length) },
        { label: 'avg completion', value: `${avgPct}%` },
      ],
      items: group.map((s) => ({
        student: s,
        detail: `Missing: ${['personal', 'academic', 'subjects', 'lifestyle'].filter((step) => !s.profile.stepsComplete.includes(step as any)).join(', ') || 'None'}`,
        badge: { label: `${s.profile.completionPct}%`, color: 'bg-primary/10 text-primary-ink' }
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
          // Brand, not `warning-fill`. This is a COUNT of students whose profile
          // isn't finished — a quantity, and one with no date attached, so "act
          // soon" is a promise the panel can't keep. The per-student badge is a
          // percentage for the same reason. (`deadlines_week` below keeps `danger`:
          // that one genuinely is dated.)
          accentColor: 'bg-primary',
          items: group.map((s) => ({
            student: s,
            detail: `${s.profile.completionPct}% complete — missing: ${['personal', 'academic', 'subjects', 'lifestyle'].filter((step) => !s.profile.stepsComplete.includes(step as any)).join(', ') || 'flags only'}`,
            badge: { label: `${s.profile.completionPct}%`, color: 'bg-primary/10 text-primary-ink' }
          }))
        });
        break;
      }
      case 'top_destination': {
        const group = students.filter((s) => s.matches.some((m) => m.country === 'UK') || s.applications.some((a) => a.country === 'UK'));
        setDrilldown({
          title: 'UK-Bound Students',
          subtitle: `${group.length} student${group.length !== 1 ? 's' : ''} targeting the United Kingdom`,
          accentColor: 'bg-primary',
          items: group.map((s) => {
            const ukMatches = s.matches.filter((m) => m.country === 'UK');
            return {
              student: s,
              detail: ukMatches.map((m) => m.university).join(', '),
              badge: { label: `${ukMatches.length} UK`, color: 'bg-primary/10 text-primary-ink' }
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
          accentColor: 'bg-success-fill',
          items: group.map((s) => {
            const submitted = s.applications.filter((a) => a.status === 'submitted');
            return {
              student: s,
              detail: submitted.map((a) => `${a.university} — ${a.program}`).join(' · '),
              badge: { label: `${submitted.length} sent`, color: 'bg-success-subtle text-success' }
            };
          })
        });
        break;
      }
      case 'deadlines_week': {
        // Match the "deadlines this week" tile: daysUntil 0–7, parsed as LOCAL
        // dates (see lib/utils/dates.ts), same window as deriveCohortStats.
        const items: DrilldownItem[] = [];
        students.forEach((s) => {
          const urgentDeadlines = s.deadlines.filter((d) => {
            const du = daysUntil(d.date);
            return du >= 0 && du <= 7;
          });
          if (urgentDeadlines.length > 0) {
            items.push({
              student: s,
              detail: urgentDeadlines.map((d) => `${d.university} — ${parseLocalDate(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`).join(' · '),
              badge: { label: `${urgentDeadlines.length} due`, color: 'bg-danger-subtle text-danger' }
            });
          }
        });
        setDrilldown({
          title: 'Deadlines This Week',
          subtitle: `${items.length} student${items.length !== 1 ? 's' : ''} with upcoming deadlines`,
          accentColor: 'bg-danger-fill',
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
              badge: { label: `${reachMatches.length} reach`, color: 'bg-danger-subtle text-danger' }
            });
          }
        });
        setDrilldown({
          title: 'Reach-Tier Matches',
          subtitle: `${items.length} student${items.length !== 1 ? 's' : ''} with Reach-tier matches`,
          accentColor: 'bg-danger-fill',
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
          accentColor: 'bg-muted-foreground',
          items: all.map((s) => {
            const hasSafe = s.matches.some((m) => m.tier === 'Safe');
            const safeMatches = s.matches.filter((m) => m.tier === 'Safe');
            return {
              student: s,
              detail: hasSafe
                ? safeMatches.map((m) => m.university).join(', ')
                : 'No Safe-tier options — consider adding safety schools',
              badge: hasSafe
                ? { label: `${safeMatches.length} safe`, color: 'bg-success-subtle text-success' }
                : { label: 'At risk', color: 'bg-danger-subtle text-danger' }
            };
          })
        });
        break;
      }
    }
  };

  // Custom widget buckets open the same drill-down panel as the built-in
  // charts, listing each student in the clicked group with the counted rows
  // (apps/matches/deadlines) as detail text.
  const handleCustomSelect = (def: CustomWidgetDef, bucket: CustomWidgetBucket) => {
    const meta = getCustomWidgetSourceMeta(def.source);
    const items: DrilldownItem[] = bucket.students.map(({ student, details }) => ({
      student,
      detail: details.slice(0, 3).join(' · '),
      badge:
        def.source === 'students'
          ? undefined
          : {
              label: `${details.length} ${details.length === 1 ? meta.unitSingular : meta.unitPlural}`,
              color: 'bg-primary/10 text-primary-ink'
            }
    }));
    setDrilldown({
      title: bucket.label,
      subtitle: `${bucket.students.length} student${bucket.students.length !== 1 ? 's' : ''} · ${def.title}`,
      accentColor: 'bg-primary',
      summaryStats:
        def.source === 'students'
          ? [{ label: 'students', value: String(bucket.students.length) }]
          : [
              { label: 'students', value: String(bucket.students.length) },
              { label: meta.unitPlural, value: String(bucket.count) }
            ],
      items
    });
  };

  function renderWidget(
    id: AnalyticsWidgetKey,
    index: number,
    removeWidget: (id: AnalyticsWidgetKey) => void,
    sizes: AnalyticsWidgetSizes,
    toggleSize: (id: AnalyticsWidgetKey) => void,
    dragHandlers: AnalyticsDragHandlers
  ) {
    if (isCustomWidgetId(id)) {
      const def = customWidgetById.get(id);
      if (!def) return null;
      return (
        <AnalyticsWidget
          key={id}
          id={id}
          title={def.title}
          description={describeCustomWidget(def)}
          icon={Sparkles}
          onRemove={removeWidget}
          onToggleSize={toggleSize}
          size={sizes[id]}
          index={index}
          dragHandlers={dragHandlers}
        >
          <CustomWidgetChart def={def} students={students} onSelect={(bucket) => handleCustomSelect(def, bucket)} />
        </AnalyticsWidget>
      );
    }

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
          tone="counsellor"
        eyebrow="Counsellor"
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

      <AnalyticsWidgetGrid
        customEntries={customEntries}
        onCreateWidget={() => setBuilderOpen(true)}
        onDeleteCustomWidget={deleteCustomWidget}
      >
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

      <CustomWidgetBuilder
        open={builderOpen}
        onOpenChange={setBuilderOpen}
        students={students}
        onCreate={addCustomWidget}
      />

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
  // Six tinted cards in a row cancelled each other out: when every tile is a
  // coloured block, none of them is the one to look at. The cards are now plain
  // surfaces and the tone survives where it is actually read — on the number.
  const insights = [
    {
      key: 'profile_gaps',
      label: 'Profile gaps',
      value: `${stats.flagged} student${stats.flagged !== 1 ? 's' : ''}`,
      detail: 'have incomplete profiles affecting match quality',
      // Was `text-warning`, which had to change with the drill-down it opens: the
      // tile and the panel are the same fact, and this one is a headcount of
      // unfinished profiles — a quantity with no deadline behind it.
      color: 'text-primary-ink',
      bg: 'bg-card',
      border: 'border-border',
      hoverBorder: 'hover:border-muted-foreground'
    },
    {
      key: 'top_destination',
      label: 'Top destination',
      value: 'United Kingdom',
      detail: 'is the #1 preferred study destination across the cohort',
      color: 'text-primary-ink',
      bg: 'bg-card',
      border: 'border-border',
      hoverBorder: 'hover:border-muted-foreground'
    },
    {
      key: 'submission_rate',
      label: 'Submission rate',
      value: `${Math.round((totalSubmittedApps / (totalApps || 1)) * 100)}%`,
      detail: 'of all applications have been submitted',
      color: 'text-success',
      bg: 'bg-card',
      border: 'border-border',
      hoverBorder: 'hover:border-muted-foreground'
    },
    {
      key: 'deadlines_week',
      label: 'Deadlines this week',
      value: String(stats.deadlinesThisWeek),
      detail: `deadline${stats.deadlinesThisWeek !== 1 ? 's' : ''} require immediate attention`,
      color: 'text-danger',
      bg: 'bg-card',
      border: 'border-border',
      hoverBorder: 'hover:border-muted-foreground'
    },
    {
      key: 'reach_apps',
      label: 'Reach applications',
      value: `${totalReachMatches}`,
      detail: 'Reach-tier matches across cohort — worth monitoring closely',
      color: TIER_VISUAL.reach.text,
      bg: 'bg-card',
      border: 'border-border',
      hoverBorder: 'hover:border-muted-foreground'
    },
    {
      key: 'safe_coverage',
      label: 'Safe coverage',
      value: `${safeCoverageCount} / ${stats.total}`,
      detail: 'students have at least one Safe-tier option',
      color: 'text-muted-foreground',
      bg: 'bg-card',
      border: 'border-border',
      hoverBorder: 'hover:border-muted-foreground'
    }
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {insights.map(({ key, label, value, detail, color, bg, border, hoverBorder }) => (
        <button
          key={key}
          onClick={() => onInsightClick(key)}
          className={`rounded-2xl border px-4 py-4 text-left hover-lift cursor-pointer ${bg} ${border} ${hoverBorder}`}
        >
          <p className={`text-lg font-bold ${color}`}>{value}</p>
          <p className="text-xs font-semibold text-foreground">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        </button>
      ))}
    </div>
  );
}
