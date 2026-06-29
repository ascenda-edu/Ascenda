'use client';

import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { AlertTriangle, TrendingUp, BarChart2, Clock, Activity, PieChart, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { PageHero } from '@/components/layout/page-hero';
import type { CounsellorStudent, AtRiskAlert } from '@/lib/data/counsellor-dummy-data';
import type { CohortStats, DeadlineWithStudent, ActivityItem } from '@/lib/counsellor/data';
import { AtRiskPanel } from './_components/at-risk-panel';
import { WidgetGrid, Widget } from './_components/widget-grid';
import type { WidgetId, DragHandlers } from './_components/widget-grid';
import { StatsBar } from './_components/stats-bar';
import { StudentAlerts } from './_components/student-alerts';
import { ApplicationFunnel } from './_components/application-funnel';
import { MatchDistribution } from './_components/match-distribution';
import { DeadlineWidget } from './_components/deadline-widget';
import { ActivityFeed } from './_components/activity-feed';
import { CohortBreakdown } from './_components/cohort-breakdown';
import { StudentRoster } from './_components/student-roster';
import { TopStudents } from './_components/top-students';
import { HelpRequestsWidget } from '@/components/counsellor/help-requests-widget';

const WIDGET_ICON_MAP: Record<WidgetId, typeof AlertTriangle> = {
  alerts: AlertTriangle,
  funnel: TrendingUp,
  matchDist: BarChart2,
  deadlines: Clock,
  activity: Activity,
  cohortBreakdown: PieChart,
  topStudents: Trophy
};

export type DashboardFilter = { type: 'stage' | 'tier' | null; value: string | null };

interface DashboardClientProps {
  students: CounsellorStudent[];
  stats: CohortStats;
  upcomingDeadlines: DeadlineWithStudent[];
  recentActivity: ActivityItem[];
  fieldDistribution: { key: string; label: string; count: number }[];
  atRiskAlerts: AtRiskAlert[];
}

export function DashboardClient({
  students,
  stats,
  upcomingDeadlines,
  recentActivity,
  fieldDistribution,
  atRiskAlerts
}: DashboardClientProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<DashboardFilter>({ type: null, value: null });

  const WIDGET_META: Record<WidgetId, { title: string; description: string }> = {
    alerts: { title: 'Student Alerts', description: `${stats.flagged} students need attention` },
    funnel: { title: 'Students by stage', description: 'How many students are at each application stage' },
    matchDist: { title: 'Match Distribution', description: 'Students with Reach / Match / Safe matches' },
    deadlines: { title: 'Upcoming Deadlines', description: 'Next 7 days' },
    activity: { title: 'Recent Activity', description: 'Latest notes and updates' },
    cohortBreakdown: { title: 'Programme & interests breakdown', description: 'IB vs A-Level and fields students are pursuing' },
    topStudents: { title: 'Top Students', description: 'Ranked by average match score' }
  };

  function renderWidget(
    id: WidgetId,
    index: number,
    removeWidget: (id: WidgetId) => void,
    sizes: Record<WidgetId, 'normal' | 'wide'>,
    toggleSize: (id: WidgetId) => void,
    dragHandlers: DragHandlers
  ) {
    const icon = WIDGET_ICON_MAP[id];
    const meta = WIDGET_META[id];
    const size = sizes[id];

    return (
      <Widget
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
        {id === 'alerts' && <StudentAlerts students={students} />}
        {id === 'funnel' && (
          <ApplicationFunnel
            funnel={stats.appFunnel}
            totalStudents={stats.total}
            activeStage={filter.type === 'stage' ? (filter.value as any) : null}
            onSelectStage={(stage) =>
              setFilter(filter.value === stage ? { type: null, value: null } : { type: 'stage', value: stage })
            }
            onNavigateStage={(stage) => router.push(`/counsellor/students?stage=${stage}`)}
          />
        )}
        {id === 'matchDist' && (
          <MatchDistribution
            tiers={stats.matchTiers}
            activeTier={filter.type === 'tier' ? (filter.value as any) : null}
            onSelectTier={(tier) =>
              setFilter(filter.value === tier ? { type: null, value: null } : { type: 'tier', value: tier })
            }
            onNavigateTier={(tier) => router.push(`/counsellor/students?tier=${tier}`)}
          />
        )}
        {id === 'deadlines' && <DeadlineWidget deadlines={upcomingDeadlines} />}
        {id === 'activity' && <ActivityFeed activity={recentActivity} />}
        {id === 'cohortBreakdown' && (
          <CohortBreakdown
            programmeBreakdown={stats.programmeBreakdown}
            fieldDistribution={fieldDistribution}
            onNavigateProgramme={(prog) => router.push(`/counsellor/students?programme=${prog}`)}
            onNavigateField={(field) => router.push(`/counsellor/students?field=${encodeURIComponent(field)}`)}
          />
        )}
        {id === 'topStudents' && <TopStudents students={students} />}
      </Widget>
    );
  }

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Counsellor"
        accent="Cohort"
        highlight={`${stats.total} students`}
        title="Overview"
        description="Daily triage — at-risk students, this week's deadlines, recent activity. For trends and cohort breakdowns, see Analytics."
        stats={[
          { label: 'Students', value: String(stats.total), detail: 'Active this cycle' },
          { label: 'Avg Completion', value: `${stats.avgCompletion}%`, detail: 'Profile completeness' },
          { label: 'Deadlines / wk', value: String(stats.deadlinesThisWeek), detail: 'Next 7 days' },
          { label: 'Need Attention', value: String(stats.flagged), detail: 'Flags raised' }
        ]}
      />

      <StatsBar stats={stats} />

      {/* At-Risk Students */}
      {atRiskAlerts.length > 0 && (
        <div className="surface-card surface-card--static">
          <div className="relative z-10 space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Proactive</p>
              <h2 className="text-lg font-semibold text-foreground">At-risk students</h2>
              <p className="text-xs text-muted-foreground">Students who may need your attention based on activity and deadline patterns.</p>
            </div>
            <AtRiskPanel alerts={atRiskAlerts} />
          </div>
        </div>
      )}

      {/* Live help requests — student-originated, demo segue lands here */}
      <HelpRequestsWidget />

      <WidgetGrid>
        {(visibleWidgets, removeWidget, sizes, toggleSize, dragHandlers) => (
          <div className="space-y-6">
            {/* Responsive 2-col grid; wide widgets span 2 cols */}
            <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
              <AnimatePresence mode="popLayout">
                {visibleWidgets.map((id, idx) =>
                  renderWidget(id, idx, removeWidget, sizes, toggleSize, dragHandlers)
                )}
              </AnimatePresence>
            </div>

            {/* Student Roster */}
            <div className="pt-4">
              <div className="mb-6 flex items-center justify-between pb-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Cohort</p>
                  <h2 className="text-2xl font-semibold text-foreground">Student Roster</h2>
                  <p className="text-xs text-muted-foreground">Manage your cohort and track progress</p>
                </div>
              </div>
              <StudentRoster
                students={students}
                externalFilter={filter}
                onClearExternalFilter={() => setFilter({ type: null, value: null })}
              />
            </div>
          </div>
        )}
      </WidgetGrid>
    </div>
  );
}
