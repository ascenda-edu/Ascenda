'use client';

import type { ReactNode } from 'react';
import { BarChart2, PieChart, TrendingUp, CheckCircle, Target, Users } from 'lucide-react';
import type { CustomWidgetId } from '@/lib/counsellor/custom-widgets';
import {
  WidgetGridCore,
  WidgetShell,
  type WidgetDragHandlers,
  type WidgetShellProps,
  type WidgetSize
} from './widget-grid-core';

/**
 * The ANALYTICS widget grid. Registry + storage keys + copy only, plus the
 * user-created ("custom:…") widget wiring; the state machine, customise panel
 * and card live in `widget-grid-core.tsx`, shared with the overview grid (see
 * the doc comment there).
 */

export type AnalyticsWidgetId =
  | 'programmeSplit'
  | 'ibDistribution'
  | 'fieldChart'
  | 'completionBreakdown'
  | 'fullFunnel'
  | 'matchTierSummary'
  | 'insights';

// Built-in ids stay a closed union; user-created widgets are `custom:<uuid>`
// ids that flow through the same visibility/order/size machinery.
export type AnalyticsWidgetKey = AnalyticsWidgetId | CustomWidgetId;

// Built-in widgets always have a size; custom widgets only gain an entry once
// resized, so reads by custom id must handle undefined (default 'normal').
export type AnalyticsWidgetSizes = Record<AnalyticsWidgetId, WidgetSize> &
  Partial<Record<CustomWidgetId, WidgetSize>>;

export const isCustomWidgetId = (id: string): id is CustomWidgetId => id.startsWith('custom:');

export interface CustomWidgetPanelEntry {
  id: CustomWidgetId;
  label: string;
  description: string;
}

export interface AnalyticsWidgetConfig {
  id: AnalyticsWidgetId;
  label: string;
  description: string;
  icon: typeof BarChart2;
}

export const ANALYTICS_WIDGET_CONFIGS: AnalyticsWidgetConfig[] = [
  { id: 'programmeSplit', label: 'IB vs A-Level split', description: 'Programme breakdown across students', icon: PieChart },
  { id: 'ibDistribution', label: 'IB score distribution', description: 'How students are scoring across bands', icon: BarChart2 },
  { id: 'fieldChart', label: 'Fields of interest', description: 'Subject areas students are pursuing', icon: Target },
  { id: 'completionBreakdown', label: 'Profile completion', description: 'How complete student profiles are', icon: CheckCircle },
  { id: 'fullFunnel', label: 'Applications by stage', description: 'Stage-by-stage view across the cohort', icon: TrendingUp },
  { id: 'matchTierSummary', label: 'Reach / Match / Safe split', description: 'Banding across all matches', icon: Users },
  { id: 'insights', label: 'Highlights', description: 'Quick takeaways across your students', icon: BarChart2 }
];

// Unchanged keys — an existing counsellor's saved layout must survive this.
const STORAGE_KEY = 'ascenda-counsellor-analytics-widgets';

const ALL_IDS: AnalyticsWidgetId[] = ['programmeSplit', 'ibDistribution', 'fieldChart', 'completionBreakdown', 'fullFunnel', 'matchTierSummary', 'insights'];

const DEFAULT_SIZES: AnalyticsWidgetSizes = {
  programmeSplit: 'normal', ibDistribution: 'normal', fieldChart: 'normal',
  completionBreakdown: 'normal', fullFunnel: 'normal', matchTierSummary: 'normal', insights: 'wide'
};

export type AnalyticsDragHandlers = WidgetDragHandlers<AnalyticsWidgetKey>;

interface AnalyticsWidgetGridProps {
  /** User-created widgets to list in the customise panel. */
  customEntries?: CustomWidgetPanelEntry[];
  /** When set, renders "New widget" affordances that invoke this. */
  onCreateWidget?: () => void;
  /** When set, custom entries in the panel get a delete affordance. */
  onDeleteCustomWidget?: (id: CustomWidgetId) => void;
  children: (
    visibleWidgets: AnalyticsWidgetKey[],
    removeWidget: (id: AnalyticsWidgetKey) => void,
    sizes: AnalyticsWidgetSizes,
    toggleSize: (id: AnalyticsWidgetKey) => void,
    dragHandlers: AnalyticsDragHandlers
  ) => ReactNode;
}

export const AnalyticsWidgetGrid = ({
  children,
  customEntries,
  onCreateWidget,
  onDeleteCustomWidget
}: AnalyticsWidgetGridProps) => (
  <WidgetGridCore<AnalyticsWidgetKey, AnalyticsWidgetSizes>
    storageKey={STORAGE_KEY}
    configs={ANALYTICS_WIDGET_CONFIGS}
    defaultVisible={ALL_IDS}
    defaultSizes={DEFAULT_SIZES}
    noun="chart"
    nounPlural="charts"
    panelTitle="Analytics Charts"
    panelDescription="Toggle charts on or off"
    customEntries={customEntries}
    onCreateWidget={onCreateWidget}
    // Only custom entries carry a delete affordance, so the id the core hands
    // back is always one of theirs — narrowing here keeps the caller's type.
    onDeleteCustomWidget={
      onDeleteCustomWidget
        ? (id) => { if (isCustomWidgetId(id)) onDeleteCustomWidget(id); }
        : undefined
    }
  >
    {children}
  </WidgetGridCore>
);

export type AnalyticsWidgetProps = Omit<WidgetShellProps<AnalyticsWidgetKey>, 'noun'>;

export const AnalyticsWidget = (props: AnalyticsWidgetProps) => (
  <WidgetShell<AnalyticsWidgetKey> {...props} noun="chart" />
);
