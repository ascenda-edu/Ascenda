'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The intake form's searchable single-select.
 *
 * It replaces `CountryCombobox` and `SubjectCombobox`, which were 105 lines of
 * byte-identical code differing only in their option array and one placeholder.
 *
 * ── Kept deliberately, do not "clean up" ────────────────────────────────────
 * `onMouseDown` selects, not `onClick`. Its ordering against the document-level
 * `mousedown` outside-click handler is what makes a click land on the option
 * instead of closing the list first.
 *
 * The `value` → `query` sync effect is still here. It is an antipattern paired
 * with the index keys the row lists use: React reconciles survivors of a removal
 * onto different component instances, so a row's internal `query` would otherwise
 * belong to the row above it, and this effect is what corrects that.
 * `intake-form.characterization.test.tsx` says it outright — "delete either half
 * and this test goes red". Both halves go together, in that order, or neither.
 *
 * ── Three fixes neither original had ────────────────────────────────────────
 * 1. Ten options, not eight, in a scrollable list. Eight was arbitrary and
 *    "United" matches more countries than that, so real matches were unreachable.
 * 2. The active option is scrolled into view, so keyboard navigation past the
 *    visible end is no longer invisible.
 * 3. An empty state. With no matches the `<ul>` was not rendered at all while the
 *    input still reported `aria-expanded="true"` — a lie to a screen reader, and
 *    silence to everyone else.
 */

const MAX_OPTIONS = 10;

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  placeholder?: string;
  /** Rendered by this component, so it must NOT be wrapped in a <label> by the caller. */
  error?: string;
  /** Stable id the error message owns, for `aria-describedby`. */
  errorId?: string;
  id?: string;
  /** Announced when nothing matches. */
  emptyLabel?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Search…',
  error,
  errorId,
  id,
  emptyLabel = 'No matches'
}: ComboboxProps) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-opt-${index}`;

  // Keep the display in sync when the value changes externally (hydration, and
  // the index-key reconciliation described above).
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options.slice(0, MAX_OPTIONS);
    const q = query.toLowerCase();
    return options.filter((option) => option.toLowerCase().includes(q)).slice(0, MAX_OPTIONS);
  }, [query, options]);

  // Reset the active option whenever the visible list changes.
  useEffect(() => { setHighlight(-1); }, [query, open]);

  // Follow the active option. Without this, arrowing past the tenth item moves a
  // highlight nobody can see.
  useEffect(() => {
    if (highlight < 0 || !listRef.current) return;
    listRef.current
      .querySelector(`[data-index="${highlight}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (option: string) => {
    onChange(option);
    setQuery(option);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight((current) => Math.min(filtered.length - 1, current + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => Math.max(0, current - 1));
    } else if (event.key === 'Enter') {
      if (open && highlight >= 0 && highlight < filtered.length) {
        event.preventDefault();
        select(filtered[highlight]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
      setHighlight(-1);
    }
  };

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={open && highlight >= 0 ? optionId(highlight) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className={cn('form-input', 'pr-9', error && 'border-destructive ring-1 ring-destructive/30')}
          value={query}
          placeholder={placeholder}
          onChange={(event) => { setQuery(event.target.value); onChange(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
      </div>

      {open ? (
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          className="absolute z-overlay mt-1 max-h-64 w-full overflow-y-auto overflow-hidden rounded-xl border border-border bg-popover shadow-e-3"
        >
          {filtered.length === 0 ? (
            // A real option-less row rather than an absent list: `aria-expanded`
            // stays honest and the user is told why nothing is happening.
            <li role="option" aria-selected={false} aria-disabled className="px-4 py-2.5 text-sm text-muted-foreground">
              {emptyLabel}
            </li>
          ) : (
            filtered.map((option, index) => (
              <li key={option} id={optionId(index)} role="option" aria-selected={index === highlight} data-index={index}>
                <button
                  type="button"
                  tabIndex={-1}
                  className={cn(
                    'w-full px-4 py-2.5 text-left text-sm transition-colors',
                    index === highlight ? 'bg-muted/60' : 'hover:bg-muted/60'
                  )}
                  onMouseDown={() => select(option)}
                  onMouseEnter={() => setHighlight(index)}
                >
                  {option}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {error ? <p id={errorId} role="alert" className="mt-1 text-xs font-medium text-danger">{error}</p> : null}
    </div>
  );
}
