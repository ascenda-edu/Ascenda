'use client';

import { useEffect, useState } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { RETURNING_USER_STORAGE_KEY } from '@/lib/constants';

/**
 * Where should a landing-page CTA send this visitor? `/login` by default,
 * `/dashboard` for returning users (localStorage flag) or live sessions.
 * Extracted for reuse across the landing hero, nav and CTA.
 */
export function useLaunchHref() {
    const supabase = useSupabase();
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

            const { data, error } = await supabase.auth.getSession();
            if (!error && data.session && isActive) {
                setHref('/dashboard');
            }
        };

        void determine();
        return () => { isActive = false; };
    }, [supabase]);

    return href;
}
