'use client';

import { ErrorState } from '@/components/ui/error-state';

export default function ToolboxError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState scope="Toolbox" title="Unable to load your toolbox." error={error} reset={reset} />;
}
