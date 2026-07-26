'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpDown, Check, ChevronDown } from 'lucide-react';
import type { SortOption } from '@/lib/university-search/search-params';
import { SORT_OPTIONS } from '@/lib/university-search/search-params';
import { cn } from '@/lib/utils';

export const SORT_LABELS: Record<SortOption, string> = {
  fit: 'Best match',
  'tuition-asc': 'Tuition: low to high',
  'tuition-desc': 'Tuition: high to low',
  ranking: 'University ranking',
  name: 'Course name A–Z',
};

interface SortMenuProps {
  value: SortOption;
  onChange: (s: SortOption) => void;
}

export function SortMenu({ value, onChange }: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(() => SORT_OPTIONS.indexOf(value));
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Sync the highlighted option to the selected value each time the menu opens.
  useEffect(() => {
    if (open) {
      const idx = SORT_OPTIONS.indexOf(value);
      setActiveIndex(idx < 0 ? 0 : idx);
    }
  }, [open, value]);

  // Move DOM focus to follow the active option while the menu is open.
  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  const select = (option: SortOption) => {
    onChange(option);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % SORT_OPTIONS.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + SORT_OPTIONS.length) % SORT_OPTIONS.length);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(SORT_OPTIONS.length - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select(SORT_OPTIONS[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'inline-flex h-11 min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-medium transition-[border-color,background-color,color] duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          open
            ? 'border-border bg-muted text-foreground'
            : 'border-transparent text-foreground hover:border-border'
        )}
      >
        <ArrowUpDown className="h-4 w-4 text-muted-foreground" aria-hidden />
        <span className="hidden whitespace-nowrap sm:inline">{SORT_LABELS[value]}</span>
        <span className="whitespace-nowrap sm:hidden">Sort</span>
        <ChevronDown
          className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            role="listbox"
            aria-label="Sort results by"
            tabIndex={-1}
            onKeyDown={onListKeyDown}
            className="absolute right-0 z-panel mt-2 w-64 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-e-3 dark:border-white/10"
          >
            {SORT_OPTIONS.map((option, index) => {
              const selected = option === value;
              return (
                <button
                  key={option}
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  onClick={() => select(option)}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition-colors cursor-pointer focus-visible:outline-none',
                    index === activeIndex ? 'bg-muted' : 'hover:bg-muted/60',
                    selected ? 'font-semibold text-primary-ink' : 'text-foreground'
                  )}
                >
                  <span>{SORT_LABELS[option]}</span>
                  {selected ? <Check className="h-4 w-4 shrink-0" aria-hidden /> : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
