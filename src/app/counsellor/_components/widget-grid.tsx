'use client';

import type { ReactNode } from 'react';
import {
  LayoutDashboard, AlertTriangle, TrendingUp, BarChart2,
  Clock, Activity, PieChart, Trophy
} from 'lucide-react';
import {
  WidgetGridCore,
  WidgetShell,
  type WidgetDragHandlers,
  type WidgetShellProps,
  type WidgetSize
} from './widget-grid-core';

/**
 * The OVERVIEW widget grid. Registry + storage keys + copy only; the state
 * machine, customise panel and card live in `widget-grid-core.tsx`, shared with
 * the analytics grid (see the doc comment there).
 */

export type WidgetId =
  | 'alerts'
  | 'funnel'
  | 'matchDist'
  | 'deadlines'
  | 'activity'
  | 'cohortBreakdown'
  | 'topStudents';

export interface WidgetConfig {
  id: WidgetId;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
}

export const WIDGET_CONFIGS: WidgetConfig[] = [
  { id: 'alerts', label: 'Students needing attention', description: 'Flagged or at-risk students', icon: AlertTriangle },
  { id: 'funnel', label: 'Applications by stage', description: 'Where each student is in the process', icon: TrendingUp },
  { id: 'matchDist', label: 'Reach / Match / Safe split', description: 'Banding across all your students', icon: BarChart2 },
  { id: 'deadlines', label: 'Upcoming deadlines', description: 'Deadlines in the next 7 days', icon: Clock },
  { id: 'activity', label: 'Recent activity', description: 'Latest notes and updates', icon: Activity },
  { id: 'cohortBreakdown', label: 'Programme & interests breakdown', description: 'IB vs A-Level and fields of study', icon: PieChart },
  { id: 'topStudents', label: 'Top students', description: 'Ranked by average match score', icon: Trophy }
];

// Unchanged keys — an existing counsellor's saved layout must survive this.
const STORAGE_KEY = 'ascenda-counsellor-widgets';
// Bump when the DEFAULT_VISIBLE / DEFAULT_SIZES shape changes — first load
// after the bump clears old prefs so the new defaults take effect once.
const STORAGE_VERSION = '2';
// Overview keeps a focused triage set; deeper analytics live on /counsellor/analytics.
// At-risk students are already surfaced in the dedicated panel above the grid;
// the 'alerts' widget would duplicate it, so it's hidden by default.
const DEFAULT_VISIBLE: WidgetId[] = ['deadlines', 'activity'];
const DEFAULT_SIZES: Record<WidgetId, WidgetSize> = {
  alerts: 'normal', funnel: 'normal', matchDist: 'normal',
  deadlines: 'normal', activity: 'normal', cohortBreakdown: 'wide', topStudents: 'normal'
};

export type DragHandlers = WidgetDragHandlers<WidgetId>;

interface WidgetGridProps {
  children: (
    visibleWidgets: WidgetId[],
    removeWidget: (id: WidgetId) => void,
    sizes: Record<WidgetId, WidgetSize>,
    toggleSize: (id: WidgetId) => void,
    dragHandlers: DragHandlers
  ) => ReactNode;
}

export const WidgetGrid = ({ children }: WidgetGridProps) => (
  <WidgetGridCore<WidgetId, Record<WidgetId, WidgetSize>>
    storageKey={STORAGE_KEY}
    storageVersion={STORAGE_VERSION}
    configs={WIDGET_CONFIGS}
    defaultVisible={DEFAULT_VISIBLE}
    defaultSizes={DEFAULT_SIZES}
    noun="widget"
    nounPlural="widgets"
    panelTitle="Dashboard Widgets"
    panelDescription="Toggle widgets on or off"
  >
    {children}
  </WidgetGridCore>
);

export type WidgetProps = Omit<WidgetShellProps<WidgetId>, 'noun'>;

export const Widget = (props: WidgetProps) => <WidgetShell<WidgetId> {...props} noun="widget" />;
