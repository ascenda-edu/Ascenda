'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function AdminError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState scope="Admin" title="Unable to load the admin view." error={error} reset={reset} />;
}
