'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function MatchesError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState scope="Matches" title="Unable to load your matches." error={error} reset={reset} />;
}
