'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function ErrorBoundary({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // No `scope`: this is the catch-all, so it can't name the thing that failed.
  return <ErrorState title="We hit a snag loading this view." error={error} reset={reset} />;
}
