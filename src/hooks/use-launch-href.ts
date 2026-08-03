'use client';

import { useEffect, useState } from 'react';
import { RETURNING_USER_STORAGE_KEY } from '@/lib/constants';

/**
 * Where should a landing-page CTA send this visitor? `/login` by default,
 * `/dashboard` for returning users (localStorage flag) or live sessions.
 * Extracted for reuse across the landing hero, nav and CTA.
 *
 * The Supabase client is loaded with a DYNAMIC import, deliberately. A static
 * `useSupabase()` here pulled @supabase/ssr + supabase-js (auth/realtime/
 * storage/postgrest — 57.4 kB gzipped) into the critical bundle of the public
 * landing page, purely to choose one link's href. The returning-user fast path
 * below never touches Supabase at all, and `href` already defaults to `/login`
 * and updates asynchronously, so deferring the SDK to the cold-visitor branch
 * changes nothing user-visible. See docs/audit/08-performance.md F1.
 */
export function useLaunchHref() {
    const [href, setHref] = useState('/login');

    useEffect(() => {
        let isActive = true;

        const determine = async () => {
            const hasVisitedBefore =
                typeof window !== 'undefined' &&
                window.localStorage.getItem(RETURNING_USER_STORAGE_KEY) === 'true';

            if (hasVisitedBefore) {
                if (isActive) setHref('/dashboard');
                return;
            }

            try {
                const { getBrowserSupabaseClient } = await import('@/lib/supabase/client');
                if (!isActive) return;

                const supabase = getBrowserSupabaseClient();
                const { data, error } = await supabase.auth.getSession();
                if (!error && data.session && isActive) {
                    setHref('/dashboard');
                }
            } catch {
                // Chunk fetch failed or Supabase env is missing. `/login` is the
                // correct fallback and is already set — a marketing CTA must not
                // be able to break the landing page.
            }
        };

        void determine();
        return () => { isActive = false; };
    }, []);

    return href;
}
