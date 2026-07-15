'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart2, PieChart, TrendingUp, CheckCircle, Target, Users,
  X, SlidersHorizontal, GripVertical, Maximize2, Minimize2,
  Plus, Sparkles, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { readJSON, writeJSON } from '@/lib/utils/local-storage';
import type { CustomWidgetId } from '@/lib/counsellor/custom-widgets';

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
export type AnalyticsWidgetSizes = Record<AnalyticsWidgetId, 'normal' | 'wide'> &
  Partial<Record<CustomWidgetId, 'normal' | 'wide'>>;

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

const STORAGE_KEY = 'ascenda-counsellor-analytics-widgets';
const STORAGE_KEY_ORDER = 'ascenda-counsellor-analytics-widgets-order';
const STORAGE_KEY_SIZES = 'ascenda-counsellor-analytics-widgets-sizes';

const ALL_IDS: AnalyticsWidgetId[] = ['programmeSplit', 'ibDistribution', 'fieldChart', 'completionBreakdown', 'fullFunnel', 'matchTierSummary', 'insights'];

const DEFAULT_SIZES: AnalyticsWidgetSizes = {
  programmeSplit: 'normal', ibDistribution: 'normal', fieldChart: 'normal',
  completionBreakdown: 'normal', fullFunnel: 'normal', matchTierSummary: 'normal', insights: 'wide'
};

const isKeyArray = (parsed: unknown): parsed is AnalyticsWidgetKey[] => Array.isArray(parsed);

function loadPrefs(): AnalyticsWidgetKey[] { return readJSON(STORAGE_KEY, ALL_IDS as AnalyticsWidgetKey[], isKeyArray); }
function loadOrder(): AnalyticsWidgetKey[] { return readJSON(STORAGE_KEY_ORDER, ALL_IDS as AnalyticsWidgetKey[], isKeyArray); }

function loadSizes(): AnalyticsWidgetSizes {
  const parsed = readJSON<unknown>(STORAGE_KEY_SIZES, null);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ...DEFAULT_SIZES, ...(parsed as Partial<AnalyticsWidgetSizes>) };
  }
  return DEFAULT_SIZES;
}

function savePrefs(v: AnalyticsWidgetKey[]) { writeJSON(STORAGE_KEY, v); }
function saveOrder(v: AnalyticsWidgetKey[]) { writeJSON(STORAGE_KEY_ORDER, v); }
function saveSizes(v: AnalyticsWidgetSizes) { writeJSON(STORAGE_KEY_SIZES, v); }

export type AnalyticsDragHandlers = {
  onDragStart: (id: AnalyticsWidgetKey) => void;
  onDragOver: (e: React.DragEvent, id: AnalyticsWidgetKey) => void;
  onDrop: (id: AnalyticsWidgetKey) => void;
  onDragEnd: () => void;
  dragOver: AnalyticsWidgetKey | null;
};

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
  ) => React.ReactNode;
}

export const AnalyticsWidgetGrid = ({
  children,
  customEntries,
  onCreateWidget,
  onDeleteCustomWidget
}: AnalyticsWidgetGridProps) => {
  const [visibleWidgets, setVisibleWidgets] = useState<AnalyticsWidgetKey[]>(ALL_IDS);
  const [order, setOrder] = useState<AnalyticsWidgetKey[]>(ALL_IDS);
  const [sizes, setSizes] = useState<AnalyticsWidgetSizes>(DEFAULT_SIZES);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [dragOver, setDragOver] = useState<AnalyticsWidgetKey | null>(null);
  const dragId = useRef<AnalyticsWidgetKey | null>(null);
  const knownCustomIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    setVisibleWidgets(loadPrefs());
    setOrder(loadOrder());
    setSizes(loadSizes());
    setHydrated(true);
  }, []);

  // Newly created custom widgets become visible immediately; deleted ones are
  // scrubbed from all three persisted maps (visibility, order, sizes). The
  // first post-hydration run only snapshots what is already stored, so
  // previously hidden custom widgets stay hidden.
  useEffect(() => {
    if (!hydrated) return;
    const ids = (customEntries ?? []).map((entry) => entry.id);
    if (knownCustomIds.current === null) {
      knownCustomIds.current = new Set(ids);
      return;
    }
    const previous = knownCustomIds.current;
    const added = ids.filter((id) => !previous.has(id));
    const removed = [...previous].filter((id) => !ids.includes(id as CustomWidgetId));
    if (!added.length && !removed.length) return;
    knownCustomIds.current = new Set(ids);
    setVisibleWidgets((prev) => {
      const next = [...prev.filter((id) => !added.includes(id as CustomWidgetId) && !removed.includes(id)), ...added];
      savePrefs(next);
      return next;
    });
    setOrder((prev) => {
      const next = [...prev.filter((id) => !added.includes(id as CustomWidgetId) && !removed.includes(id)), ...added];
      saveOrder(next);
      return next;
    });
    if (removed.length) {
      setSizes((prev) => {
        if (!removed.some((id) => id in prev)) return prev;
        const next = { ...prev };
        for (const id of removed) delete next[id as CustomWidgetId];
        saveSizes(next);
        return next;
      });
    }
  }, [customEntries, hydrated]);

  const toggleWidget = (id: AnalyticsWidgetKey) => {
    setVisibleWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      savePrefs(next);
      return next;
    });
  };

  const toggleSize = (id: AnalyticsWidgetKey) => {
    setSizes((prev) => {
      const next = { ...prev, [id]: prev[id] === 'wide' ? 'normal' : 'wide' };
      saveSizes(next);
      return next;
    });
  };

  const dragHandlers: AnalyticsDragHandlers = {
    dragOver,
    onDragStart: (id) => { dragId.current = id; },
    onDragOver: (e, id) => {
      e.preventDefault();
      if (dragId.current && dragId.current !== id) setDragOver(id);
    },
    onDrop: (targetId) => {
      const fromId = dragId.current;
      dragId.current = null;
      setDragOver(null);
      if (!fromId || fromId === targetId) return;
      setOrder((prev) => {
        const allIds = [...new Set([...prev, ...visibleWidgets])];
        const next = [...allIds];
        const fromIdx = next.indexOf(fromId);
        const toIdx = next.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return prev;
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, fromId);
        saveOrder(next);
        return next;
      });
    },
    onDragEnd: () => {
      dragId.current = null;
      setDragOver(null);
    }
  };

  if (!hydrated) return null;

  const customList = customEntries ?? [];
  // Ids without a config (e.g. a deleted custom widget in stale prefs) never
  // reach the render prop or the counts.
  const validIds = new Set<string>([...ALL_IDS, ...customList.map((entry) => entry.id)]);
  const visibleCount = visibleWidgets.filter((id) => validIds.has(id)).length;

  const orderedVisible = [
    ...order.filter((id) => visibleWidgets.includes(id)),
    ...visibleWidgets.filter((id) => !order.includes(id))
  ].filter((id) => validIds.has(id));

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {visibleCount} of {ANALYTICS_WIDGET_CONFIGS.length + customList.length} charts · drag to reorder · resize with ⤢
        </p>
        <div className="flex items-center gap-2">
          {onCreateWidget && (
            <button
              onClick={onCreateWidget}
              className="flex items-center gap-2 rounded-full border border-dashed border-primary/50 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition hover:-translate-y-0.5 hover:bg-primary/10 hover:shadow-sm"
            >
              <Plus className="h-4 w-4" />
              New widget
            </button>
          )}
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-sm',
              panelOpen
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-background text-foreground hover:bg-muted/60'
            )}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Customise
          </button>
        </div>
      </div>

      {/* Customise panel */}
      <AnimatePresence>
        {panelOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="rounded-2xl border border-border bg-card p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">Analytics Charts</p>
                <p className="text-xs text-muted-foreground">Toggle charts on or off</p>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                aria-label="Close chart panel"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted/60"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {ANALYTICS_WIDGET_CONFIGS.map((cfg) => {
                const Icon = cfg.icon;
                const active = visibleWidgets.includes(cfg.id);
                return (
                  <button
                    key={cfg.id}
                    onClick={() => toggleWidget(cfg.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5',
                      active
                        ? 'border-primary/40 bg-primary/8 text-foreground shadow-sm'
                        : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40'
                    )}
                  >
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', active ? 'bg-primary/15' : 'bg-muted/50')}>
                      <Icon className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{cfg.label}</p>
                      <p className="truncate text-[11px] opacity-70">{cfg.description}</p>
                    </div>
                    <div className={cn(
                      'ml-auto h-4 w-4 shrink-0 rounded-full border-2 transition',
                      active ? 'border-primary bg-primary' : 'border-border bg-background'
                    )} />
                  </button>
                );
              })}
              {customList.map((entry) => {
                const active = visibleWidgets.includes(entry.id);
                return (
                  <div key={entry.id} className="relative">
                    <button
                      onClick={() => toggleWidget(entry.id)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5',
                        active
                          ? 'border-primary/40 bg-primary/8 text-foreground shadow-sm'
                          : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40'
                      )}
                    >
                      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', active ? 'bg-primary/15' : 'bg-muted/50')}>
                        <Sparkles className={cn('h-4 w-4', active ? 'text-primary' : 'text-muted-foreground')} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{entry.label}</p>
                        <p className="truncate text-[11px] opacity-70">{entry.description}</p>
                      </div>
                      <div className={cn(
                        'ml-auto h-4 w-4 shrink-0 rounded-full border-2 transition',
                        active ? 'border-primary bg-primary' : 'border-border bg-background'
                      )} />
                    </button>
                    {onDeleteCustomWidget && (
                      <button
                        onClick={() => onDeleteCustomWidget(entry.id)}
                        aria-label={`Delete ${entry.label} widget`}
                        title="Delete custom widget"
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition hover:border-destructive/40 hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
              {onCreateWidget && (
                <button
                  onClick={onCreateWidget}
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left text-primary transition hover:-translate-y-0.5 hover:bg-primary/10"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">Create custom widget</p>
                    <p className="truncate text-[11px] opacity-70">Count anything, your way</p>
                  </div>
                </button>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => {
                  setVisibleWidgets(ALL_IDS);
                  setOrder(ALL_IDS);
                  setSizes(DEFAULT_SIZES);
                  savePrefs(ALL_IDS);
                  saveOrder(ALL_IDS);
                  saveSizes(DEFAULT_SIZES);
                }}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Reset to defaults
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chart content */}
      <div className="min-h-0">
        {children(orderedVisible, toggleWidget, sizes, toggleSize, dragHandlers)}
      </div>
    </div>
  );
};

/* ─── Reusable Analytics Widget wrapper ──────────────────────────────────────── */

export interface AnalyticsWidgetProps {
  id: AnalyticsWidgetKey;
  title: string;
  description?: string;
  icon: typeof BarChart2;
  onRemove: (id: AnalyticsWidgetKey) => void;
  onToggleSize?: (id: AnalyticsWidgetKey) => void;
  size?: 'normal' | 'wide';
  children: React.ReactNode;
  className?: string;
  index?: number;
  dragHandlers?: AnalyticsDragHandlers;
}

export const AnalyticsWidget = ({
  id, title, description, icon: Icon, onRemove, onToggleSize, size = 'normal',
  children, className, index = 0, dragHandlers
}: AnalyticsWidgetProps) => {
  const isDragOver = dragHandlers?.dragOver === id;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ delay: index * 0.07, duration: 0.35 }}
      draggable
      onDragStart={() => dragHandlers?.onDragStart(id)}
      onDragOver={(e) => dragHandlers?.onDragOver(e, id)}
      onDrop={() => dragHandlers?.onDrop(id)}
      onDragEnd={() => dragHandlers?.onDragEnd()}
      className={cn(
        'surface-card surface-card--static flex flex-col gap-4 transition-shadow duration-200',
        isDragOver && 'ring-2 ring-primary ring-offset-2 shadow-lg scale-[1.01]',
        size === 'wide' && 'md:col-span-2',
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 cursor-grab items-center justify-center rounded-xl bg-muted/50 active:cursor-grabbing"
            title="Drag to reorder"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onToggleSize && (
            <button
              onClick={() => onToggleSize(id)}
              aria-label={size === 'wide' ? `Shrink ${title} chart` : `Expand ${title} chart`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
              title={size === 'wide' ? 'Shrink chart' : 'Expand chart to full width'}
            >
              {size === 'wide'
                ? <Minimize2 className="h-3.5 w-3.5" />
                : <Maximize2 className="h-3.5 w-3.5" />
              }
            </button>
          )}
          <button
            onClick={() => onRemove(id)}
            aria-label={`Remove ${title} chart`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            title="Remove chart"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </motion.div>
  );
};
