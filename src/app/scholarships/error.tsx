'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function ScholarshipsError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState scope="Scholarships" title="Unable to load scholarships." error={error} reset={reset} />;
}
