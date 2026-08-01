'use client';

import { useEffect, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown, ArrowUp, GripVertical, Maximize2, Minimize2,
  Plus, SlidersHorizontal, Sparkles, Trash2, X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { readJSON, writeJSON } from '@/lib/utils/local-storage';

/**
 * The counsellor widget grid — one implementation, two call sites.
 *
 * `widget-grid.tsx` (overview) and `analytics-widget-grid.tsx` were 405 and 524
 * lines of the same component: same visibility/order/size state machine, same
 * localStorage trio, same customise panel, same drag/keyboard reorder, and a
 * byte-for-byte identical card wrapper. They differed only in
 *
 *   · the localStorage key prefix,
 *   · the widget registry and its defaults,
 *   · the noun in the copy ("widgets" vs "charts"), and
 *   · analytics' extra user-created ("custom:…") widgets.
 *
 * All four are parameters here. The two former files are now thin, typed
 * wrappers that keep their public API and — importantly — their exact storage
 * keys, so nobody's saved layout is lost.
 *
 * Persistence layout, per call site, derived from one `storageKey`:
 *   <key>         visible ids
 *   <key>-order   display order (includes hidden ids, so unhiding restores position)
 *   <key>-sizes   id -> 'normal' | 'wide'
 *   <key>-v       storage version, only when `storageVersion` is set
 */

export type WidgetSize = 'normal' | 'wide';

/** A built-in widget: what the customise panel needs to draw a toggle for it. */
export interface WidgetGridEntry<Id extends string> {
  id: Id;
  label: string;
  description: string;
  icon: LucideIcon;
}

/** A user-created widget. Same toggle, no icon of its own (it wears Sparkles). */
export interface WidgetPanelEntry<Id extends string> {
  id: Id;
  label: string;
  description: string;
}

export type WidgetDragHandlers<Id extends string> = {
  onDragStart: (id: Id) => void;
  onDragOver: (e: DragEvent, id: Id) => void;
  onDrop: (id: Id) => void;
  onDragEnd: () => void;
  dragOver: Id | null;
  /** Keyboard-accessible alternative to drag reorder. */
  onMove: (id: Id, direction: -1 | 1) => void;
  /** Number of visible widgets — lets move buttons disable at the edges. */
  count: number;
};

export interface WidgetGridCoreProps<Id extends string, Sizes extends object> {
  /** Base localStorage key; `-order`, `-sizes` and `-v` hang off it. */
  storageKey: string;
  /**
   * Bump when the defaults change shape — the first load after a bump clears
   * this call site's stored prefs so the new defaults take effect once. Omit to
   * never migrate.
   */
  storageVersion?: string;
  configs: readonly WidgetGridEntry<Id>[];
  defaultVisible: readonly Id[];
  defaultSizes: Sizes;
  /** Noun used in the copy and in every button label ('widget' | 'chart'). */
  noun: string;
  nounPlural: string;
  panelTitle: string;
  panelDescription: string;
  /** User-created widgets to list in the customise panel. */
  customEntries?: readonly WidgetPanelEntry<Id>[];
  /** When set, renders "New widget" affordances that invoke this. */
  onCreateWidget?: () => void;
  /** When set, custom entries in the panel get a delete affordance. */
  onDeleteCustomWidget?: (id: Id) => void;
  children: (
    visibleWidgets: Id[],
    removeWidget: (id: Id) => void,
    sizes: Sizes,
    toggleSize: (id: Id) => void,
    dragHandlers: WidgetDragHandlers<Id>
  ) => ReactNode;
}

function loadIds<Id extends string>(key: string, fallback: readonly Id[]): Id[] {
  return readJSON<Id[]>(key, [...fallback], (parsed): parsed is Id[] => Array.isArray(parsed));
}

function loadSizes<Sizes extends object>(key: string, defaults: Sizes): Sizes {
  const parsed = readJSON<unknown>(key, null);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return { ...defaults, ...(parsed as Partial<Sizes>) };
  }
  return defaults;
}

/** Sizes is the caller's own map type; reads by id go through this one cast. */
const asSizeRecord = (sizes: object) => sizes as Record<string, WidgetSize | undefined>;

export function WidgetGridCore<Id extends string, Sizes extends object>({
  storageKey,
  storageVersion,
  configs,
  defaultVisible,
  defaultSizes,
  noun,
  nounPlural,
  panelTitle,
  panelDescription,
  customEntries,
  onCreateWidget,
  onDeleteCustomWidget,
  children
}: WidgetGridCoreProps<Id, Sizes>) {
  const orderKey = `${storageKey}-order`;
  const sizesKey = `${storageKey}-sizes`;
  const versionKey = `${storageKey}-v`;

  const [visibleWidgets, setVisibleWidgets] = useState<Id[]>(() => [...defaultVisible]);
  const [order, setOrder] = useState<Id[]>(() => [...defaultVisible]);
  const [sizes, setSizes] = useState<Sizes>(defaultSizes);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [dragOver, setDragOver] = useState<Id | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragId = useRef<Id | null>(null);
  const knownCustomIds = useRef<Set<Id> | null>(null);

  useEffect(() => {
    // One-shot migration: clear this call site's prefs if the version is behind.
    if (storageVersion) {
      try {
        if (localStorage.getItem(versionKey) !== storageVersion) {
          localStorage.removeItem(storageKey);
          localStorage.removeItem(orderKey);
          localStorage.removeItem(sizesKey);
          localStorage.setItem(versionKey, storageVersion);
        }
      } catch {
        // Private mode / quota — prefs simply don't persist.
      }
    }
    setVisibleWidgets(loadIds(storageKey, defaultVisible));
    setOrder(loadIds(orderKey, defaultVisible));
    setSizes(loadSizes(sizesKey, defaultSizes));
    setHydrated(true);
    // Mount-only by design: every call site passes module-level constants, and
    // re-reading storage later would stomp the user's in-session changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const removed = [...previous].filter((id) => !ids.includes(id));
    if (!added.length && !removed.length) return;
    knownCustomIds.current = new Set(ids);
    setVisibleWidgets((prev) => {
      const next = [...prev.filter((id) => !added.includes(id) && !removed.includes(id)), ...added];
      writeJSON(storageKey, next);
      return next;
    });
    setOrder((prev) => {
      const next = [...prev.filter((id) => !added.includes(id) && !removed.includes(id)), ...added];
      writeJSON(orderKey, next);
      return next;
    });
    if (removed.length) {
      setSizes((prev) => {
        const record = asSizeRecord(prev);
        if (!removed.some((id) => id in record)) return prev;
        const next = { ...record };
        for (const id of removed) delete next[id];
        writeJSON(sizesKey, next);
        return next as Sizes;
      });
    }
  }, [customEntries, hydrated, storageKey, orderKey, sizesKey]);

  const toggleWidget = (id: Id) => {
    setVisibleWidgets((prev) => {
      const next = prev.includes(id) ? prev.filter((w) => w !== id) : [...prev, id];
      writeJSON(storageKey, next);
      return next;
    });
  };

  const toggleSize = (id: Id) => {
    setSizes((prev) => {
      const next = { ...prev, [id]: asSizeRecord(prev)[id] === 'wide' ? 'normal' : 'wide' } as Sizes;
      writeJSON(sizesKey, next);
      return next;
    });
  };

  // Keyboard alternative to drag reorder — moves a widget one slot among the
  // visible widgets (hidden widgets keep their stored order at the end).
  const moveWidget = (id: Id, direction: -1 | 1) => {
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
      writeJSON(orderKey, next);
      return next;
    });
  };

  const resetToDefaults = () => {
    const ids = [...defaultVisible];
    setVisibleWidgets(ids);
    setOrder(ids);
    setSizes(defaultSizes);
    writeJSON(storageKey, ids);
    writeJSON(orderKey, ids);
    writeJSON(sizesKey, defaultSizes);
  };

  const customList = customEntries ?? [];
  // Ids without a config (a deleted custom widget, or a built-in that has since
  // been renamed, left behind in stale prefs) never reach the render prop or
  // the counts — the render prop looks its metadata up by id and would crash.
  const validIds = new Set<string>([...configs.map((cfg) => cfg.id), ...customList.map((entry) => entry.id)]);
  const visibleCount = visibleWidgets.filter((id) => validIds.has(id)).length;

  const dragHandlers: WidgetDragHandlers<Id> = {
    dragOver,
    onMove: moveWidget,
    count: visibleCount,
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
        writeJSON(orderKey, next);
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
  ].filter((id) => validIds.has(id));

  return (
    <div className={cn('space-y-6', isDragging && 'select-none')}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {visibleCount} of {configs.length + customList.length} {nounPlural} · drag to reorder · resize with ⤢
        </p>
        <div className="flex items-center gap-2">
          {onCreateWidget && (
            <button
              onClick={onCreateWidget}
              className="flex items-center gap-2 rounded-full border border-dashed border-primary/50 bg-primary/5 px-4 py-2 text-sm font-medium text-primary-ink hover-lift hover:bg-primary/10"
            >
              <Plus className="h-4 w-4" />
              New widget
            </button>
          )}
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium hover-lift',
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
            className="rounded-2xl border border-border bg-card p-5 shadow-e-3"
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-foreground">{panelTitle}</p>
                <p className="text-xs text-muted-foreground">{panelDescription}</p>
              </div>
              <button
                onClick={() => setPanelOpen(false)}
                aria-label={`Close ${noun} panel`}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-border hover:bg-muted/60"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {configs.map((cfg) => {
                const Icon = cfg.icon;
                const active = visibleWidgets.includes(cfg.id);
                return (
                  <button
                    key={cfg.id}
                    onClick={() => toggleWidget(cfg.id)}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5',
                      active
                        ? 'border-primary/40 bg-primary/10 text-foreground shadow-e-1'
                        : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40'
                    )}
                  >
                    <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', active ? 'bg-primary/20' : 'bg-muted/50')}>
                      <Icon className={cn('h-4 w-4', active ? 'text-primary-ink' : 'text-muted-foreground')} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{cfg.label}</p>
                      <p className="truncate text-label opacity-70">{cfg.description}</p>
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
                          ? 'border-primary/40 bg-primary/10 text-foreground shadow-e-1'
                          : 'border-border/60 bg-background/60 text-muted-foreground hover:bg-muted/40'
                      )}
                    >
                      <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', active ? 'bg-primary/20' : 'bg-muted/50')}>
                        <Sparkles className={cn('h-4 w-4', active ? 'text-primary-ink' : 'text-muted-foreground')} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{entry.label}</p>
                        <p className="truncate text-label opacity-70">{entry.description}</p>
                      </div>
                      <div className={cn(
                        'ml-auto h-4 w-4 shrink-0 rounded-full border-2 transition',
                        active ? 'border-primary bg-primary' : 'border-border bg-background'
                      )} />
                    </button>
                    {onDeleteCustomWidget && (
                      <button
                        onClick={() => onDeleteCustomWidget(entry.id)}
                        aria-label={`Delete ${entry.label} ${noun}`}
                        title={`Delete custom ${noun}`}
                        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-e-1 transition hover:border-destructive/40 hover:text-destructive"
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
                  className="flex items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-left text-primary-ink transition hover:-translate-y-0.5 hover:bg-primary/10"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/20">
                    <Plus className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">Create custom {noun}</p>
                    <p className="truncate text-label opacity-70">Count anything, your way</p>
                  </div>
                </button>
              )}
            </div>
            <div className="mt-3 flex justify-end">
              <button
                onClick={resetToDefaults}
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
}

/* ─── The card every widget sits in ─────────────────────────────────────────── */

export interface WidgetShellProps<Id extends string> {
  id: Id;
  title: string;
  description?: string;
  icon: LucideIcon;
  onRemove: (id: Id) => void;
  onToggleSize?: (id: Id) => void;
  size?: WidgetSize;
  children: ReactNode;
  className?: string;
  index?: number;
  dragHandlers?: WidgetDragHandlers<Id>;
  /** Noun in every button label ('widget' | 'chart'). */
  noun: string;
}

export function WidgetShell<Id extends string>({
  id, title, description, icon: Icon, onRemove, onToggleSize, size = 'normal',
  children, className, index = 0, dragHandlers, noun
}: WidgetShellProps<Id>) {
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
        'surface-card flex flex-col gap-4 transition-shadow duration-200',
        isDragOver && 'ring-2 ring-primary ring-offset-2 shadow-e-3 scale-[1.01]',
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
            <Icon className="h-4 w-4 text-primary-ink" />
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
                aria-label={`Move ${title} ${noun} up`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                title={`Move ${noun} up`}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => dragHandlers.onMove(id, 1)}
                disabled={index >= dragHandlers.count - 1}
                aria-label={`Move ${title} ${noun} down`}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-30"
                title={`Move ${noun} down`}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {onToggleSize && (
            <button
              onClick={() => onToggleSize(id)}
              aria-label={size === 'wide' ? `Shrink ${title} ${noun}` : `Expand ${title} ${noun}`}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
              title={size === 'wide' ? `Shrink ${noun}` : `Expand ${noun} to full width`}
            >
              {size === 'wide'
                ? <Minimize2 className="h-3.5 w-3.5" />
                : <Maximize2 className="h-3.5 w-3.5" />
              }
            </button>
          )}
          <button
            onClick={() => onRemove(id)}
            aria-label={`Remove ${title} ${noun}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
            title={`Remove ${noun}`}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </motion.div>
  );
}
