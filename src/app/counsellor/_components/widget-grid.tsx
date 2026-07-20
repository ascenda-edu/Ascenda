'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutDashboard, AlertTriangle, TrendingUp, BarChart2,
  Clock, Activity, PieChart, Trophy, X, SlidersHorizontal,
  GripVertical, Maximize2, Minimize2, ArrowUp, ArrowDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { readJSON, writeJSON } from '@/lib/utils/local-storage';

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

const STORAGE_KEY = 'ascenda-counsellor-widgets';
const STORAGE_KEY_ORDER = 'ascenda-counsellor-widgets-order';
const STORAGE_KEY_SIZES = 'ascenda-counsellor-widgets-sizes';
const STORAGE_VERSION_KEY = 'ascenda-counsellor-widgets-v';
// Bump when the DEFAULT_VISIBLE / DEFAULT_SIZES shape changes — first load
// after the bump clears old prefs so the new defaults take effect once.
const STORAGE_VERSION = '2';
// Overview keeps a focused triage set; deeper analytics live on /counsellor/analytics.
// At-risk students are already surfaced in the dedicated panel above the grid;
// the 'alerts' widget would duplicate it, so it's hidden by default.
const DEFAULT_VISIBLE: WidgetId[] = ['deadlines', 'activity'];
const DEFAULT_SIZES: Record<WidgetId, 'normal' | 'wide'> = {
  alerts: 'normal', funnel: 'normal', matchDist: 'normal',
  deadlines: 'normal', activity: 'normal', cohortBreakdown: 'wide', topStudents: 'normal'
};

const isIdArray = (parsed: unknown): parsed is WidgetId[] => Array.isArray(parsed);

function loadPrefs(): WidgetId[] { return readJSON(STORAGE_KEY, DEFAULT_VISIBLE, isIdArray); }
function loadOrder(): WidgetId[] { return readJSON(STORAGE_KEY_ORDER, DEFAULT_VISIBLE, isIdArray); }

function loadSizes(): Record<WidgetId, 'normal' | 'wide'> {
  const parsed = readJSON<unknown>(STORAGE_KEY_SIZES, null);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ...DEFAULT_SIZES, ...(parsed as Partial<Record<WidgetId, 'normal' | 'wide'>>) };
  }
  return DEFAULT_SIZES;
}

function savePrefs(v: WidgetId[]) { writeJSON(STORAGE_KEY, v); }
function saveOrder(v: WidgetId[]) { writeJSON(STORAGE_KEY_ORDER, v); }
function saveSizes(v: Record<WidgetId, 'normal' | 'wide'>) { writeJSON(STORAGE_KEY_SIZES, v); }

export type DragHandlers = {
  onDragStart: (id: WidgetId) => void;
  onDragOver: (e: React.DragEvent, id: WidgetId) => void;
  onDrop: (id: WidgetId) => void;
  onDragEnd: () => void;
  dragOver: WidgetId | null;
  /** Keyboard-accessible alternative to drag reorder. */
  onMove: (id: WidgetId, direction: -1 | 1) => void;
  /** Number of visible widgets — lets move buttons disable at the edges. */
  count: number;
};

interface WidgetGridProps {
  children: (
    visibleWidgets: WidgetId[],
    removeWidget: (id: WidgetId) => void,
    sizes: Record<WidgetId, 'normal' | 'wide'>,
    toggleSize: (id: WidgetId) => void,
    dragHandlers: DragHandlers
  ) => React.ReactNode;
}

export const WidgetGrid = ({ children }: WidgetGridProps) => {
  const [visibleWidgets, setVisibleWidgets] = useState<WidgetId[]>(DEFAULT_VISIBLE);
  const [order, setOrder] = useState<WidgetId[]>(DEFAULT_VISIBLE);
  const [sizes, setSizes] = useState<Record<WidgetId, 'normal' | 'wide'>>(DEFAULT_SIZES);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [dragOver, setDragOver] = useState<WidgetId | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragId = useRef<WidgetId | null>(null);

  useEffect(() => {
    // One-shot migration: clear old prefs if the storage version is behind.
    try {
      const storedVersion = localStorage.getItem(STORAGE_VERSION_KEY);
      if (storedVersion !== STORAGE_VERSION) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_KEY_ORDER);
        localStorage.removeItem(STORAGE_KEY_SIZES);
        localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
      }
    } catch {
      // ignore
    }
    setVisibleWidgets(loadPrefs());
    setOrder(loadOrder());
    setSizes(loadSizes());
    setHydrated(true);
  }, []);

  const toggleWidget = (id: WidgetId) => {
    setVisibleWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      savePrefs(next);
      return next;
    });
  };

  const toggleSize = (id: WidgetId) => {
    setSizes((prev) => {
      const next = { ...prev, [id]: prev[id] === 'wide' ? 'normal' : 'wide' };
      saveSizes(next);
      return next;
    });
  };

  // Keyboard alternative to drag reorder — moves a widget one slot among the
  // visible widgets (hidden widgets keep their stored order at the end).
  const moveWidget = (id: WidgetId, direction: -1 | 1) => {
    setOrder((prev) => {
      const visible = [
        ...prev.filter((w) => visibleWidgets.includes(w)),
        ...visibleWidgets.filter((w) => !prev.includes(w))
      ];
      const fromIdx = visible.indexOf(id);
      const toIdx = fromIdx + direction;
      if (fromIdx === -1 || toIdx < 0 || toIdx >= visible.length) return prev;
      [visible[fromIdx], visible[toIdx]] = [visible[toIdx], visible[fromIdx]];
      const next = [...visible, ...prev.filter((w) => !visibleWidgets.includes(w))];
      saveOrder(next);
      return next;
    });
  };

  const dragHandlers: DragHandlers = {
    dragOver,
    onMove: moveWidget,
    count: visibleWidgets.length,
    onDragStart: (id) => { dragId.current = id; setIsDragging(true); },
    onDragOver: (e, id) => {
      e.preventDefault();
      if (dragId.current && dragId.current !== id) setDragOver(id);
    },
    onDrop: (targetId) => {
      const fromId = dragId.current;
      dragId.current = null;
      setDragOver(null);
      setIsDragging(false);
      if (!fromId || fromId === targetId) return;
      setOrder((prev) => {
        // Ensure all visible widgets are in the order array
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
      setIsDragging(false);
    }
  };

  if (!hydrated) return null;

  // Merge order with visible — preserve drag order, append newly added widgets at end
  const orderedVisible = [
    ...order.filter((id) => visibleWidgets.includes(id)),
    ...visibleWidgets.filter((id) => !order.includes(id))
  ];

  return (
    <div className={cn('space-y-6', isDragging && 'select-none')}>
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {visibleWidgets.length} of {WIDGET_CONFIGS.length} widgets · drag to reorder · resize with ⤢
        </p>
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
                <p className="font-semibold text-foreground">Dashboard Widgets</p>
                <p className="text-xs text-muted-foreground">Toggle widgets on or off</p>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                aria-label="Close widget panel"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted/60"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {WIDGET_CONFIGS.map((cfg) => {
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
                      <p className="truncate text-[0.6875rem] opacity-70">{cfg.description}</p>
                    </div>
                    <div className={cn(
                      'ml-auto h-4 w-4 shrink-0 rounded-full border-2 transition',
                      active ? 'border-primary bg-primary' : 'border-border bg-background'
                    )} />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => {
                  setVisibleWidgets(DEFAULT_VISIBLE);
                  setOrder(DEFAULT_VISIBLE);
                  setSizes(DEFAULT_SIZES);
                  savePrefs(DEFAULT_VISIBLE);
                  saveOrder(DEFAULT_VISIBLE);
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

      {/* Widget content */}
      <div className="min-h-0">
        {children(orderedVisible, toggleWidget, sizes, toggleSize, dragHandlers)}
      </div>
    </div>
  );
};

export interface WidgetProps {
  id: WidgetId;
  title: string;
  description?: string;
  icon: typeof LayoutDashboard;
  onRemove: (id: WidgetId) => void;
  onToggleSize?: (id: WidgetId) => void;
  size?: 'normal' | 'wide';
  children: React.ReactNode;
  className?: string;
  index?: number;
  dragHandlers?: DragHandlers;
}

export const Widget = ({
  id, title, description, icon: Icon, onRemove, onToggleSize, size = 'normal',
  children, className, index = 0, dragHandlers
}: WidgetProps) => {
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
          {dragHandlers && (
            <>
              <button
                onClick={() => dragHandlers.onMove(id, -1)}
                disabled={index === 0}
                aria-label={`Move ${title} widget up`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                title="Move widget up"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => dragHandlers.onMove(id, 1)}
                disabled={index >= dragHandlers.count - 1}
                aria-label={`Move ${title} widget down`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                title="Move widget down"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {onToggleSize && (
            <button
              onClick={() => onToggleSize(id)}
              aria-label={size === 'wide' ? `Shrink ${title} widget` : `Expand ${title} widget`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
              title={size === 'wide' ? 'Shrink widget' : 'Expand widget to full width'}
            >
              {size === 'wide'
                ? <Minimize2 className="h-3.5 w-3.5" />
                : <Maximize2 className="h-3.5 w-3.5" />
              }
            </button>
          )}
          <button
            onClick={() => onRemove(id)}
            aria-label={`Remove ${title} widget`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            title="Remove widget"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </motion.div>
  );
};
