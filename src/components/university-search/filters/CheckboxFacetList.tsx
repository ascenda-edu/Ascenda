'use client';

import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ShowMoreToggle } from '@/components/ui/show-more-toggle';
import { cn } from '@/lib/utils';

interface CheckboxFacetListProps {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  maxVisible?: number;
}

export function CheckboxFacetList({
  options,
  selected,
  onToggle,
  searchable = false,
  searchPlaceholder = 'Search…',
  maxVisible = 8,
}: CheckboxFacetListProps) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  const visible = expanded ? filtered : filtered.slice(0, maxVisible);
  const canExpand = filtered.length > maxVisible;

  return (
    <div className="space-y-2">
      {searchable ? (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            spellCheck={false}
            className="h-10 pl-9"
          />
        </div>
      ) : null}

      {visible.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">No matches</p>
      ) : (
        <ul className="space-y-0.5">
          {visible.map((option) => {
            const checked = selected.includes(option);
            return (
              <li key={option}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => onToggle(option)}
                  className="flex min-h-[40px] w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-sm transition-colors cursor-pointer hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors',
                      checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'
                    )}
                  >
                    {checked ? <Check className="h-3.5 w-3.5" /> : null}
                  </span>
                  <span className={cn('line-clamp-2', checked ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                    {option}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {canExpand ? (
        <ShowMoreToggle expanded={expanded} onToggle={() => setExpanded((e) => !e)} total={filtered.length} noun="options" />
      ) : null}
    </div>
  );
}
