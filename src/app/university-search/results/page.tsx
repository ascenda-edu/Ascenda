'use client';

// Legacy redirect. The unified live search now lives at
// /university-search/search — this route exists ONLY so old bookmarked or
// shared /results URLs still resolve. We forward every query param verbatim
// (including the legacy `filters=group:value|…` token); parseSearchParams on
// the destination understands both the new discrete params and the old token,
// so nothing is lost in the hop.

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function ResultsRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const qs = searchParams.toString();
    router.replace(qs ? `/university-search/search?${qs}` : '/university-search/search');
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Redirecting to search…</span>
      <span
        aria-hidden
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary"
      />
    </div>
  );
}

export default function UniversitySearchResultsRedirect() {
  return (
    <Suspense fallback={null}>
      <ResultsRedirectInner />
    </Suspense>
  );
}
