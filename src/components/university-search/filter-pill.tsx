'use client';

import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type FilterPillProps = {
  label: string;
  active?: boolean;
  onClick?: () => void;
  /**
   * When supplied, the pill renders a trailing remove (×) affordance and reads
   * as a removable chip. The toggle `onClick`/`active` API keeps working
   * unchanged — pass only `onRemove` for a pure chip, or both to combine them.
   */
  onRemove?: () => void;
};

export const FilterPill = ({ label, active = false, onClick, onRemove }: FilterPillProps) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full border text-sm font-medium transition-[transform,box-shadow,border-color,color,background-color] duration-200 whitespace-nowrap',
      onRemove ? 'pl-4 pr-1' : '',
      active
        ? 'border-primary bg-primary text-primary-foreground shadow-[0_15px_35px_rgba(15,23,42,0.18)]'
        : 'border-border bg-card text-muted-foreground'
    )}
  >
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        onRemove ? 'py-2' : 'px-4 py-2',
        !active && 'hover:text-foreground',
        onClick ? 'cursor-pointer' : 'cursor-default'
      )}
      // A pure chip (no toggle handler) should not read as an interactive
      // toggle; the remove button carries the only action in that case.
      tabIndex={onClick ? undefined : -1}
      aria-hidden={onClick ? undefined : true}
    >
      {label}
    </button>
    {onRemove ? (
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className={cn(
          // Keep the 24px visual but expand the pointer/touch hit area to ≥44px
          // via an inset ::after so small chips stay comfortably tappable.
          'relative ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors after:absolute after:-inset-2.5 after:content-[""] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 cursor-pointer',
          active ? 'hover:bg-primary-foreground/20' : 'hover:bg-muted'
        )}
      >
        <X className="h-3.5 w-3.5" aria-hidden />
      </button>
    ) : null}
  </span>
);
