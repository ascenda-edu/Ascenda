'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function UniversitySearchError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState scope="University search" title="Unable to load search." error={error} reset={reset} />;
}
