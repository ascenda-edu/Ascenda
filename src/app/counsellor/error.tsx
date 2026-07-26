'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function CounsellorError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState scope="Counsellor" title="Unable to load this view." error={error} reset={reset} />;
}
