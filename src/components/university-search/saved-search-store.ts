'use client';

// Saved university searches — persists { name, query, filters } so a student
// can re-run a search later. Remote-first against the `saved_searches` table
// (20260713150000, RLS self-only) with a per-user localStorage mirror;
// like shortlist-store.ts, the first failed remote call flips a module flag
// and the hook stays local-only for the session (covers environments where
// the migration hasn't been applied yet, and guests).

import { useCallback, useEffect, useState } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import type { FilterChip } from '@/lib/university-search/search-params';
import type { SavedSearchRow } from '@/lib/types/demo-tables';

export interface SavedSearchItem {
  id: string;
  name: string;
  query: string;
  filters: FilterChip[];
  createdAt: string;
}

const TABLE_NAME = 'saved_searches';
const STORAGE_PREFIX = 'ascenda-saved-searches-v1';

let remoteAvailable = true;
const markRemoteUnavailable = () => {
  remoteAvailable = false;
};

const storageKey = (userId: string | null) => `${STORAGE_PREFIX}::${userId ?? 'guest'}`;

const loadLocal = (userId: string | null): SavedSearchItem[] => {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? (JSON.parse(raw) as SavedSearchItem[]) : [];
  } catch {
    return [];
  }
};

const persistLocal = (userId: string | null, items: SavedSearchItem[]) => {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(items));
  } catch {
    /* storage full/blocked — remote (if available) still has the data */
  }
};

const fromRow = (row: SavedSearchRow): SavedSearchItem => ({
  id: row.id,
  name: row.name,
  query: row.query ?? '',
  filters: (row.filters ?? []) as FilterChip[],
  createdAt: row.created_at,
});

// Content identity for dedupe when ids differ (e.g. a search saved locally on
// one device and remotely on another). Filter order is canonicalised so chip
// ordering doesn't defeat the match.
const signatureOf = (item: SavedSearchItem) =>
  `${item.name}::${item.query}::${JSON.stringify(
    [...item.filters].sort((a, b) =>
      `${a.group}:${a.value}`.localeCompare(`${b.group}:${b.value}`)
    )
  )}`;

// Push a local-only item to remote, preserving its client-generated uuid so
// the local mirror and remote row stay the same identity.
const upsertRemoteSearch = async (
  supabase: ReturnType<typeof getBrowserSupabaseClient>,
  userId: string,
  item: SavedSearchItem
) => {
  if (!remoteAvailable) return;
  const { error } = await (supabase as any)
    .from(TABLE_NAME)
    .upsert(
      {
        id: item.id,
        profile_id: userId,
        name: item.name,
        query: item.query,
        filters: item.filters,
        created_at: item.createdAt,
      },
      { onConflict: 'id' }
    );
  if (error) markRemoteUnavailable();
};

export function useSavedSearches() {
  const [items, setItems] = useState<SavedSearchItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const supabase = getBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData?.session?.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);

      let next = loadLocal(uid);
      if (uid && remoteAvailable) {
        const { data, error } = await (supabase as any)
          .from(TABLE_NAME)
          .select('id, profile_id, name, query, filters, created_at, last_used_at')
          .eq('profile_id', uid)
          .order('created_at', { ascending: false });
        if (error) {
          markRemoteUnavailable();
        } else {
          const remoteItems = ((data ?? []) as SavedSearchRow[]).map(fromRow);
          const merged = [...remoteItems];

          // Merge in any local-only items and persist them remotely — remote
          // must never wipe local saves (e.g. first hydrate after the
          // saved_searches migration lands on an empty table).
          const remoteIds = new Set(remoteItems.map((item) => item.id));
          const remoteSignatures = new Set(remoteItems.map(signatureOf));
          const missingLocals = next.filter(
            (local) => !remoteIds.has(local.id) && !remoteSignatures.has(signatureOf(local))
          );
          if (missingLocals.length > 0) {
            merged.push(...missingLocals);
            // Best-effort: a failed upsert flips remoteAvailable but the items
            // survive in the merged local mirror below.
            await Promise.all(missingLocals.map((item) => upsertRemoteSearch(supabase, uid, item)));
            merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          }

          next = merged;
          persistLocal(uid, next);
        }
      }
      if (!cancelled) {
        setItems(next);
        setIsHydrated(true);
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveSearch = useCallback(
    async (name: string, query: string, filters: FilterChip[]): Promise<SavedSearchItem | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;

      let item: SavedSearchItem | null = null;
      if (userId && remoteAvailable) {
        const supabase = getBrowserSupabaseClient();
        const { data, error } = await (supabase as any)
          .from(TABLE_NAME)
          .insert({ profile_id: userId, name: trimmed, query, filters })
          .select('id, profile_id, name, query, filters, created_at, last_used_at')
          .single();
        if (error) {
          markRemoteUnavailable();
        } else {
          item = fromRow(data as SavedSearchRow);
        }
      }
      if (!item) {
        item = {
          id: crypto.randomUUID(),
          name: trimmed,
          query,
          filters,
          createdAt: new Date().toISOString(),
        };
      }

      setItems((prev) => {
        const next = [item as SavedSearchItem, ...prev];
        persistLocal(userId, next);
        return next;
      });
      return item;
    },
    [userId]
  );

  const removeSearch = useCallback(
    async (id: string) => {
      setItems((prev) => {
        const next = prev.filter((item) => item.id !== id);
        persistLocal(userId, next);
        return next;
      });
      if (userId && remoteAvailable) {
        const supabase = getBrowserSupabaseClient();
        const { error } = await (supabase as any).from(TABLE_NAME).delete().eq('id', id);
        if (error) markRemoteUnavailable();
      }
    },
    [userId]
  );

  // Fire-and-forget recency stamp when a saved search is re-run.
  const markUsed = useCallback(
    (id: string) => {
      if (!userId || !remoteAvailable) return;
      const supabase = getBrowserSupabaseClient();
      void (supabase as any)
        .from(TABLE_NAME)
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', id)
        .then(({ error }: { error: unknown }) => {
          if (error) markRemoteUnavailable();
        });
    },
    [userId]
  );

  return { items, isHydrated, saveSearch, removeSearch, markUsed };
}
