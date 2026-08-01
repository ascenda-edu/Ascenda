'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function ProfileError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState scope="Profile" title="Unable to load your profile." error={error} reset={reset} />;
}
