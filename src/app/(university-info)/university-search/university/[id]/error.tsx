'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { UniversityInformation } from '@/components/university-search/university-information';

export default function UniversityPageError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Surface error for observability while keeping the UI friendly.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-background">
      <UniversityInformation
        error="Something went wrong while loading this university. Please retry."
        className="min-h-0 pb-0 pt-6"
      />
      <div className="shell-gutter mx-auto flex w-full max-w-6xl justify-center py-8">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </div>
  );
}
