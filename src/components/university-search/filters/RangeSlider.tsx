'use client';

import { useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

interface RangeSliderProps {
  min: number;
  max: number;
  step: number;
  /** null = unbounded lower end (reported back as null too) */
  valueMin: number | null;
  /** null = unbounded upper end */
  valueMax: number | null;
  onChange: (min: number | null, max: number | null) => void;
  formatValue?: (n: number) => string;
}

const defaultFormat = (n: number): string => {
  if (n >= 1000) {
    const k = n / 1000;
    return `£${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `£${n}`;
};

type Thumb = 'min' | 'max';

export function RangeSlider({ min, max, step, valueMin, valueMax, onChange, formatValue = defaultFormat }: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Which thumb a track-initiated drag is currently moving (null = not dragging
  // from the track). Handlers are recreated each render so they always read the
  // freshest lo/hi via closure.
  const trackDragRef = useRef<Thumb | null>(null);

  const lo = valueMin ?? min;
  const hi = valueMax ?? max;

  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  const snap = (v: number) => {
    const stepped = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, stepped));
  };

  // Bounds map to null so the parent stores "unbounded" rather than the literal
  // edge value — the contract in search-params.ts.
  const emit = (nextLo: number, nextHi: number) => {
    onChange(nextLo <= min ? null : nextLo, nextHi >= max ? null : nextHi);
  };

  const setThumb = (thumb: Thumb, raw: number) => {
    const v = snap(raw);
    if (thumb === 'min') {
      emit(Math.min(v, hi), hi); // cannot cross the max thumb
    } else {
      emit(lo, Math.max(v, lo)); // cannot cross the min thumb
    }
  };

  const valueFromClientX = (clientX: number): number => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return min;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return min + ratio * (max - min);
  };

  const onThumbPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    // Stop the pointerdown from bubbling to the track's jump-to-nearest handler
    // — this pointer belongs to the thumb.
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLElement).focus();
  };

  const onThumbPointerMove = (thumb: Thumb) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    setThumb(thumb, valueFromClientX(e.clientX));
  };

  // Release capture on up / cancel / lost-capture so a drag can never get stuck
  // (e.g. the OS steals the pointer, or a browser gesture cancels it mid-drag).
  const onThumbPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  // Clicking (or dragging from) the bare track jumps the NEAREST thumb to the
  // pointer and continues the drag from there — the expected slider affordance.
  const nearestThumb = (value: number): Thumb =>
    Math.abs(value - lo) <= Math.abs(value - hi) ? 'min' : 'max';

  const onTrackPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const value = valueFromClientX(e.clientX);
    const thumb = nearestThumb(value);
    trackDragRef.current = thumb;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setThumb(thumb, value);
  };

  const onTrackPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (trackDragRef.current === null) return;
    if (!(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
    setThumb(trackDragRef.current, valueFromClientX(e.clientX));
  };

  const onTrackPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    trackDragRef.current = null;
    if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const onThumbKeyDown = (thumb: Thumb) => (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const current = thumb === 'min' ? lo : hi;
    let next: number | null = null;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        next = current + step;
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        next = current - step;
        break;
      case 'PageUp':
        next = current + step * 10;
        break;
      case 'PageDown':
        next = current - step * 10;
        break;
      case 'Home':
        next = thumb === 'min' ? min : lo;
        break;
      case 'End':
        next = thumb === 'min' ? hi : max;
        break;
      default:
        return;
    }
    e.preventDefault();
    setThumb(thumb, next);
  };

  const readout = (side: Thumb) => {
    if (side === 'min') return valueMin === null ? 'Any' : formatValue(lo);
    return valueMax === null ? 'Any' : formatValue(hi);
  };

  // 20px visual, but an inset ::after (-inset-3 → +12px each side) expands the
  // pointer/touch hit area to ≥44px so the thumb is comfortably grabbable.
  const thumbBase =
    'absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow transition-shadow cursor-grab touch-none after:absolute after:-inset-3 after:content-[""] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

  return (
    <div className="space-y-3">
      {/* Padding gives the 20px thumbs room to sit at the extremes without clipping. */}
      <div className="relative flex h-11 items-center px-2.5">
        <div
          ref={trackRef}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
          onLostPointerCapture={onTrackPointerUp}
          className="relative h-1.5 w-full rounded-full bg-muted"
        >
          <div
            className="absolute h-full rounded-full bg-primary"
            style={{ left: `${pct(lo)}%`, right: `${100 - pct(hi)}%` }}
          />
          <div
            role="slider"
            tabIndex={0}
            aria-label="Minimum tuition"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={lo}
            aria-valuetext={readout('min')}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove('min')}
            onPointerUp={onThumbPointerUp}
            onPointerCancel={onThumbPointerUp}
            onLostPointerCapture={onThumbPointerUp}
            onKeyDown={onThumbKeyDown('min')}
            className={thumbBase}
            style={{ left: `${pct(lo)}%` }}
          />
          <div
            role="slider"
            tabIndex={0}
            aria-label="Maximum tuition"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={hi}
            aria-valuetext={readout('max')}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove('max')}
            onPointerUp={onThumbPointerUp}
            onPointerCancel={onThumbPointerUp}
            onLostPointerCapture={onThumbPointerUp}
            onKeyDown={onThumbKeyDown('max')}
            className={thumbBase}
            style={{ left: `${pct(hi)}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm font-medium tabular-nums text-foreground">
        <span>{readout('min')}</span>
        <span aria-hidden className="text-muted-foreground">
          –
        </span>
        <span>{readout('max')}</span>
      </div>
    </div>
  );
}
