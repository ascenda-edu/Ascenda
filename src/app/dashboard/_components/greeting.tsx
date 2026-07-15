'use client';

import { useEffect, useState } from 'react';

/**
 * Time-of-day greeting resolved in the BROWSER's timezone. The dashboard is a
 * server component, so computing the hour there would bake in the server's
 * timezone (UTC on Vercel). A neutral fallback renders on first paint and the
 * time-based greeting is set post-mount, so server and client agree on the
 * first render (no hydration mismatch).
 */
export function Greeting({ firstName }: { firstName: string | null }) {
  const [timeGreeting, setTimeGreeting] = useState<string | null>(null);

  useEffect(() => {
    const hour = new Date().getHours();
    setTimeGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
  }, []);

  const base = timeGreeting ?? 'Welcome back';
  return <>{firstName ? `${base}, ${firstName}` : base}</>;
}
