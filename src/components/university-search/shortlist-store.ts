'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

export interface ShortlistItem {
  id: string;
  name: string;
  program: string;
  stage?: string;
  fitScore?: number | null;
  nextAction?: string | null;
  due?: string | null;
  location?: string;
}

const STORAGE_KEY_PREFIX = 'ascenda-university-shortlist-v2';
const OLD_STORAGE_KEY = 'ascenda-university-shortlist';
const DEMO_IDS = new Set(['yale-epe', 'melbourne-design', 'hkust-gbus']);
const TABLE_NAME = 'shortlisted_programs';
const SHORTLIST_SYNC_EVENT = 'ascenda:shortlist-sync';

// The shortlisted_programs table only exists on environments where the full
// schema.sql has been applied. Feature-detect once per session: after the
// first failed remote call, stop issuing doomed requests and stay
// localStorage-only instead of warning on every hydrate/add/remove.
let remoteShortlistAvailable = true;
const markRemoteUnavailable = (error: { message?: string } | null) => {
  remoteShortlistAvailable = false;
  console.warn('Shortlist remote sync disabled for this session', error?.message ?? error);
};

type ShortlistRow = {
  program_id: string;
  program_name: string | null;
  university_name: string | null;
  location: string | null;
  fit_score: number | string | null;
  stage: string | null;
  next_action: string | null;
  due_date: string | null;
};
type Client = SupabaseClient<Database>;

// Single-flight the remote hydrate. Every TrackProgramButton mounts its own
// useShortlist() (50+ on a results page). Before this, each instance fired its
// own SELECT before the first failure could flip remoteShortlistAvailable —
// producing 50× 404 + 50× console.warn when the table is missing remotely.
// Now the first mount for a given userId creates ONE promise (the SELECT); all
// others await it. A `null` resolution means remote is unavailable (flag
// flipped) and callers fall back to localStorage. The promise is keyed by
// userId and reset when the id changes (sign in/out).
let remoteHydratePromise: Promise<ShortlistRow[] | null> | null = null;
let remoteHydrateUserId: string | null = null;

const hydrateRemote = (client: Client, userId: string): Promise<ShortlistRow[] | null> => {
  if (remoteHydratePromise && remoteHydrateUserId === userId) {
    return remoteHydratePromise;
  }
  remoteHydrateUserId = userId;
  remoteHydratePromise = (async (): Promise<ShortlistRow[] | null> => {
    if (!remoteShortlistAvailable) return null;
    const { data, error } = await (client as any)
      .from(TABLE_NAME)
      .select('program_id,program_name,university_name,location,fit_score,stage,next_action,due_date')
      .eq('profile_id', userId);
    if (error) {
      markRemoteUnavailable(error);
      return null;
    }
    return (data ?? []) as ShortlistRow[];
  })();
  return remoteHydratePromise;
};

export const useShortlist = () => {
  const [items, setItems] = useState<ShortlistItem[]>([]);
  const [ready, setReady] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const supabaseRef = useRef<Client | null>(null);

  const mapRowToItem = (row: ShortlistRow): ShortlistItem => {
    const numericFit =
      typeof row.fit_score === 'number'
        ? row.fit_score
        : typeof row.fit_score === 'string'
          ? Number.parseFloat(row.fit_score)
          : null;
    return {
      id: row.program_id,
      name: row.university_name ?? 'University',
      program: row.program_name ?? 'Program',
      stage: row.stage ?? 'Researching',
      fitScore: Number.isFinite(numericFit) ? numericFit : null,
      nextAction: row.next_action,
      due: row.due_date,
      location: row.location ?? undefined
    };
  };

  const getStorageKey = useCallback((userId?: string | null) => {
    return userId ? `${STORAGE_KEY_PREFIX}::${userId}` : `${STORAGE_KEY_PREFIX}::guest`;
  }, []);

  const persistLocal = useCallback((storageKey: string, value: ShortlistItem[]) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    }
  }, []);

  const loadLocal = useCallback((storageKey: string, fallbackKeys: string[] = []): ShortlistItem[] => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(storageKey) : null;
    const legacy = fallbackKeys.length && typeof window !== 'undefined'
      ? fallbackKeys.map((key) => window.localStorage.getItem(key)).find((entry) => entry)
      : null;
    const parseItems = (value: string | null) => {
      if (!value) return null;
      try {
        return JSON.parse(value) as ShortlistItem[];
      } catch {
        return null;
      }
    };
    const migrated = parseItems(stored) ?? parseItems(legacy ?? null);
    const cleaned = migrated?.filter((item) => !DEMO_IDS.has(item.id)) ?? [];
    return cleaned;
  }, []);

  const upsertRemoteItem = useCallback(
    async (client: Client, userId: string, item: ShortlistItem) => {
      if (!remoteShortlistAvailable) return;
      const payload = {
        profile_id: userId,
        program_id: item.id,
        program_name: item.program,
        university_name: item.name,
        location: item.location ?? null,
        fit_score: item.fitScore ?? null,
        stage: item.stage ?? 'Researching',
        next_action: item.nextAction ?? null,
        due_date: item.due ?? null,
        metadata: null
      };
      const { error } = await (client as any).from(TABLE_NAME).upsert(payload, { onConflict: 'profile_id,program_id' });
      if (error) {
        markRemoteUnavailable(error);
      }
    },
    []
  );

  const deleteRemoteItem = useCallback(
    async (client: Client, userId: string, programId: string) => {
      if (!remoteShortlistAvailable) return;
      const { error } = await (client as any).from(TABLE_NAME).delete().eq('profile_id', userId).eq('program_id', programId);
      if (error) {
        markRemoteUnavailable(error);
      }
    },
    []
  );

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    supabaseRef.current = supabase;

    const hydrate = async () => {
      const session = await supabase.auth.getSession();
      const userId = session.data.session?.user?.id ?? null;
      const storageKey = getStorageKey(userId);
      const localItems = loadLocal(
        storageKey,
        userId ? [] : [OLD_STORAGE_KEY]
      );
      setProfileId(userId);

      if (!userId) {
        setItems(localItems);
        setReady(true);
        return;
      }

      // Clear legacy guest storage when a user signs in to avoid cross-account import.
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(OLD_STORAGE_KEY);
      }

      if (!remoteShortlistAvailable) {
        setItems(localItems);
        setReady(true);
        return;
      }

      // Shared single-flight SELECT (see hydrateRemote). `null` = remote
      // unavailable — the flag has been flipped, fall back to localStorage.
      const remoteRows = await hydrateRemote(supabase, userId);
      if (remoteRows === null) {
        setItems(localItems);
        setReady(true);
        return;
      }

      const remoteItems: ShortlistItem[] = remoteRows.map((row) => mapRowToItem(row));
      const merged: ShortlistItem[] = [...remoteItems];

      // Merge in any local-only items and persist them remotely
      const missingLocals = localItems.filter(
        (local) => !remoteItems.some((remote) => remote.id === local.id)
      );
      if (missingLocals.length > 0) {
        merged.push(...missingLocals);
        await Promise.all(missingLocals.map((item) => upsertRemoteItem(supabase, userId, item)));
      }

      setItems(merged);
      persistLocal(storageKey, merged);
      setReady(true);
    };

    void hydrate();
  }, [getStorageKey, loadLocal, persistLocal, upsertRemoteItem]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = getStorageKey(profileId);
    const fallbackKeys = profileId ? [] : [OLD_STORAGE_KEY];

    const syncFromStorage = () => {
      setItems(loadLocal(storageKey, fallbackKeys));
    };

    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === storageKey) {
        syncFromStorage();
      }
    };

    const onShortlistSync = () => {
      syncFromStorage();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(SHORTLIST_SYNC_EVENT, onShortlistSync as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SHORTLIST_SYNC_EVENT, onShortlistSync as EventListener);
    };
  }, [getStorageKey, loadLocal, profileId]);

  useEffect(() => {
    if (ready && typeof window !== 'undefined') {
      const storageKey = getStorageKey(profileId);
      persistLocal(storageKey, items);
    }
  }, [getStorageKey, items, persistLocal, profileId, ready]);

  // Side effects (persist, event dispatch, remote sync) run OUTSIDE the
  // setItems updater — React StrictMode double-invokes updaters, which used
  // to double-fire the upsert and sync event.
  const addItem = useCallback((item: ShortlistItem) => {
    const storageKey = getStorageKey(profileId);
    const fallbackKeys = profileId ? [] : [OLD_STORAGE_KEY];
    const latest = typeof window !== 'undefined' ? loadLocal(storageKey, fallbackKeys) : items;
    if (latest.some((existing) => existing.id === item.id)) {
      setItems(latest);
      return;
    }
    const nextItems = [
      ...latest,
      {
        stage: 'Researching',
        due: null,
        nextAction: null,
        ...item
      }
    ];
    persistLocal(storageKey, nextItems);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SHORTLIST_SYNC_EVENT));
    }
    const client = supabaseRef.current;
    if (client && profileId) {
      void upsertRemoteItem(client, profileId, item);
    }
    setItems(nextItems);
  }, [getStorageKey, items, loadLocal, persistLocal, profileId, upsertRemoteItem]);

  const removeItem = useCallback((id: string) => {
    const storageKey = getStorageKey(profileId);
    const fallbackKeys = profileId ? [] : [OLD_STORAGE_KEY];
    const latest = typeof window !== 'undefined' ? loadLocal(storageKey, fallbackKeys) : items;
    const next = latest.filter((item) => item.id !== id);
    persistLocal(storageKey, next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event(SHORTLIST_SYNC_EVENT));
    }
    const client = supabaseRef.current;
    if (client && profileId) {
      void deleteRemoteItem(client, profileId, id);
    }
    setItems(next);
  }, [deleteRemoteItem, getStorageKey, items, loadLocal, persistLocal, profileId]);

  return { items, addItem, removeItem, ready };
};
