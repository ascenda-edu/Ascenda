'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function ProfileError({
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
      <p className="eyebrow">Profile error</p>
      <h1 className="text-2xl font-semibold text-foreground">Unable to load your profile.</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This is usually temporary. Try refreshing or click below.
      </p>
      <Button type="button" onClick={() => reset()}>
        Try again
      </Button>
      {error?.digest ? <p className="text-xs text-muted-foreground">Ref: {error.digest}</p> : null}
    </div>
  );
}
