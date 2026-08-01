'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function ApplicationsError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState scope="Applications" title="Unable to load your applications." error={error} reset={reset} />;
}
