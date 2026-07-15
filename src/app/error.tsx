'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ErrorBoundary({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center text-foreground">
      <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Something went wrong</p>
      <h1 className="text-2xl font-semibold text-foreground">We hit a snag loading this view.</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This view didn&apos;t load. Try again below — and if the issue persists, let the team know so we can investigate.
      </p>
      <Button type="button" onClick={() => reset()}>
        Try again
      </Button>
      {error?.digest ? <p className="text-xs text-muted-foreground">Error reference: {error.digest}</p> : null}
    </div>
  );
}
