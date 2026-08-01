'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { UniversityInformation } from '@/components/university-search/university-information';
import { PAGE_BODY_IN_SHELL } from './_components/page-body';

export default function UniversityPageError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // Surface error for observability while keeping the UI friendly.
    console.error(error);
  }, [error]);

  // No `min-h-screen` / `max-w-6xl` wrapper any more: `layout.tsx` puts this
  // inside `<DashboardShell>`, which owns the page height and the gutter.
  return (
    <>
      <UniversityInformation
        error="Something went wrong while loading this university. Please retry."
        className={PAGE_BODY_IN_SHELL}
      />
      <div className="flex justify-center">
        <Button type="button" onClick={() => reset()}>
          Try again
        </Button>
      </div>
    </>
  );
}
