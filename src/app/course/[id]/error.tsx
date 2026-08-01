'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function CourseError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState scope="Programme" title="Unable to load this programme." error={error} reset={reset} />;
}
