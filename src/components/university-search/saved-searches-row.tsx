'use client';

// Saved-searches strip for the search hub: pill cards that re-run a stored
// query + filter set. Hidden entirely until the student has saved something.

import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { Bookmark, X } from 'lucide-react';
import { buildSearchResultsUrl } from '@/lib/university-search/search-params';
import { useSavedSearches } from './saved-search-store';

export function SavedSearchesRow() {
  const router = useRouter();
  const { items, isHydrated, removeSearch, markUsed } = useSavedSearches();

  if (!isHydrated || items.length === 0) return null;

  return (
    <section className="surface-card space-y-3" aria-label="Saved searches">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-success-subtle text-success ring-1 ring-success/25">
          <Bookmark className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pick up where you left off</p>
          <h2 className="font-heading text-lg font-bold text-foreground">Saved searches</h2>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <motion.span
              key={item.id}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="flex items-center overflow-hidden rounded-full border border-border bg-background/60 transition hover:border-primary/50"
            >
              <button
                type="button"
                onClick={() => {
                  markUsed(item.id);
                  router.push(buildSearchResultsUrl(item.query, item.filters));
                }}
                className="flex items-center gap-2 py-2 pl-4 pr-2 text-sm font-medium text-foreground"
              >
                {item.name}
                {item.filters.length > 0 && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-label tabular-nums text-muted-foreground">
                    {item.filters.length} filter{item.filters.length === 1 ? '' : 's'}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => void removeSearch(item.id)}
                aria-label={`Delete saved search ${item.name}`}
                className="mr-1.5 rounded-full p-1.5 text-muted-foreground transition hover:bg-danger-subtle hover:text-danger"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
