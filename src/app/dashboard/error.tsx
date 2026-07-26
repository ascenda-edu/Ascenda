'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState scope="Dashboard" title="Unable to load your dashboard." error={error} reset={reset} />;
}
