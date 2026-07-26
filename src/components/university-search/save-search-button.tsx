'use client';

// "Save this search" control for the results page: captures the current
// query + filter chips (from the URL) into the saved-searches store, with a
// small inline popover to name the search.

import { useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, Check } from 'lucide-react';
import { readFiltersFromParams, type FilterChip } from '@/lib/university-search/search-params';
import { useToast } from '@/components/ui/toast';
import { useSavedSearches } from './saved-search-store';

interface Props {
  query: string;
  /**
   * Live filter chips from the page's in-memory state. When provided these win
   * over reading the (300ms-debounced) URL — the URL can lag the current facet
   * selection, so deriving chips from it captured stale facets. Falls back to
   * the URL only when the caller doesn't pass chips.
   */
  chips?: FilterChip[];
}

export function SaveSearchButton({ query, chips: chipsProp }: Props) {
  const searchParams = useSearchParams();
  const { items, saveSearch } = useSavedSearches();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const chips = useMemo(
    () => chipsProp ?? readFiltersFromParams(searchParams),
    [chipsProp, searchParams]
  );
  const hasAnything = Boolean(query.trim()) || chips.length > 0;

  const defaultName =
    query.trim() ||
    chips.map((c) => c.value).slice(0, 3).join(' · ') ||
    'My search';

  const alreadySaved = items.some(
    (item) =>
      item.query === query.trim() &&
      item.filters.length === chips.length &&
      item.filters.every((f) => chips.some((c) => c.group === f.group && c.value === f.value))
  );

  const submit = async () => {
    const saved = await saveSearch(name.trim() || defaultName, query.trim(), chips);
    if (saved) {
      setOpen(false);
      setName('');
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
      showToast({
        title: `Search "${saved.name}" saved`,
        description: 'Find it in Saved searches on this page.',
        variant: 'success',
      });
    }
  };

  if (!hasAnything) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (alreadySaved || justSaved) return;
          setOpen((v) => !v);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium transition hover:-translate-y-0.5 hover:border-primary/50"
      >
        {alreadySaved || justSaved ? (
          <>
            <Check className="h-4 w-4 text-success" /> Saved
          </>
        ) : (
          <>
            <Bookmark className="h-4 w-4" /> Save search
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            className="absolute right-0 top-11 z-30 w-64 rounded-2xl border border-border bg-card p-3 shadow-e-3"
          >
            <label htmlFor="save-search-name" className="mb-1.5 block text-xs font-semibold text-muted-foreground">
              Name this search
            </label>
            <input
              id="save-search-name"
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
                if (e.key === 'Escape') setOpen(false);
              }}
              placeholder={defaultName}
              className="w-full rounded-full border border-border bg-background/60 px-3.5 py-2 text-sm outline-none focus:border-primary/50"
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition hover:-translate-y-0.5"
              >
                Save
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
