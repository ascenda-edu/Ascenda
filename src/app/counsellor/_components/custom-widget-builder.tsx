'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart2, LayoutGrid, PieChart, Plus, Sparkles, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CUSTOM_WIDGET_SOURCE_META,
  CUSTOM_WIDGET_VIZ_OPTIONS,
  newCustomWidgetId,
  suggestCustomWidgetTitle,
  type CustomWidgetDef,
  type CustomWidgetSource,
  type CustomWidgetViz
} from '@/lib/counsellor/custom-widgets';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import { CustomWidgetChart } from './custom-widget-chart';

const VIZ_ICONS: Record<CustomWidgetViz, typeof BarChart2> = {
  bars: BarChart2,
  stacked: PieChart,
  kpi: LayoutGrid
};

interface CustomWidgetBuilderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: CounsellorStudent[];
  onCreate: (def: CustomWidgetDef) => void;
}

export function CustomWidgetBuilder({ open, onOpenChange, students, onCreate }: CustomWidgetBuilderProps) {
  const [source, setSource] = useState<CustomWidgetSource>('students');
  const [dimension, setDimension] = useState<string>(CUSTOM_WIDGET_SOURCE_META[0].dimensions[0].key);
  const [viz, setViz] = useState<CustomWidgetViz>('bars');
  const [title, setTitle] = useState(() => suggestCustomWidgetTitle('students', CUSTOM_WIDGET_SOURCE_META[0].dimensions[0].key));
  const [titleTouched, setTitleTouched] = useState(false);

  useEffect(() => {
    if (open) {
      const firstDim = CUSTOM_WIDGET_SOURCE_META[0].dimensions[0].key;
      setSource('students');
      setDimension(firstDim);
      setViz('bars');
      setTitle(suggestCustomWidgetTitle('students', firstDim));
      setTitleTouched(false);
    }
  }, [open]);

  const sourceMeta = CUSTOM_WIDGET_SOURCE_META.find((meta) => meta.key === source) ?? CUSTOM_WIDGET_SOURCE_META[0];

  const pickSource = (next: CustomWidgetSource) => {
    if (next === source) return;
    const nextDim = (CUSTOM_WIDGET_SOURCE_META.find((meta) => meta.key === next) ?? CUSTOM_WIDGET_SOURCE_META[0]).dimensions[0].key;
    setSource(next);
    setDimension(nextDim);
    if (!titleTouched) setTitle(suggestCustomWidgetTitle(next, nextDim));
  };

  const pickDimension = (next: string) => {
    setDimension(next);
    if (!titleTouched) setTitle(suggestCustomWidgetTitle(source, next));
  };

  // Stable preview id so the chart's useMemo doesn't churn; the real id is
  // minted on create. `title` is deliberately left out of the def (the chart
  // never reads it, and the preview header renders it separately) so typing a
  // title doesn't re-run the cohort aggregation on every keystroke.
  const previewDef = useMemo<CustomWidgetDef>(
    () => ({ id: 'custom:preview', title: '', source, dimension, viz, createdAt: '' }),
    [source, dimension, viz]
  );

  const handleCreate = () => {
    onCreate({
      id: newCustomWidgetId(),
      title: title.trim() || suggestCustomWidgetTitle(source, dimension),
      source,
      dimension,
      viz,
      createdAt: new Date().toISOString()
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-full max-w-3xl overflow-y-auto">
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="absolute right-4 top-4 z-raised flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="border-b border-border px-7 py-5">
          <div className="eyebrow-accent flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Custom widget
          </div>
          <DialogTitle className="mt-1.5 leading-7 text-foreground">Create a custom widget</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Pick what to count, how to group it, and how to draw it — it lands on your analytics grid.
          </p>
        </div>

        {/* Body */}
        <div className="space-y-6 px-7 py-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">What do you want to count?</p>
            <div className="flex flex-wrap gap-2">
              {CUSTOM_WIDGET_SOURCE_META.map((meta) => (
                <button
                  key={meta.key}
                  type="button"
                  onClick={() => pickSource(meta.key)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
                    source === meta.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  {meta.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Group by</p>
            <div className="flex flex-wrap gap-2">
              {sourceMeta.dimensions.map((dim) => (
                <button
                  key={dim.key}
                  type="button"
                  onClick={() => pickDimension(dim.key)}
                  className={cn(
                    'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition',
                    dimension === dim.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                  )}
                >
                  {dim.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Show as</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {CUSTOM_WIDGET_VIZ_OPTIONS.map((option) => {
                const Icon = VIZ_ICONS[option.key];
                const active = viz === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setViz(option.key)}
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
                      <p className="text-xs font-semibold">{option.label}</p>
                      <p className="truncate text-label opacity-70">{option.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="cw-title" className="text-xs font-semibold text-foreground">
              Widget title
            </label>
            <input
              id="cw-title"
              type="text"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setTitleTouched(true);
              }}
              className="form-input rounded-xl py-2.5"
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Live preview</p>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-xl">
                  <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="truncate text-sm font-semibold text-foreground">
                  {title.trim() || suggestCustomWidgetTitle(source, dimension)}
                </p>
              </div>
              <CustomWidgetChart def={previewDef} students={students} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-7 py-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add widget
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
