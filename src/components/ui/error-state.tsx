'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The app's single error-boundary body.
 *
 * There were seven near-identical `error.tsx` files (root, dashboard, matches,
 * applications, profile, scholarships, counsellor, parent), each hand-rolling the
 * same centred stack and each drifting slightly — the root one still carried a raw
 * `tracking-[0.35em]` eyebrow after the rest had moved to the `.eyebrow` class, and
 * the "Ref:" / "Error reference:" label differed between them. Meanwhile
 * `/university-search`, `/toolbox`, `/course/[id]` and `/admin` had no boundary at
 * all, so a throw there escaped to the root and lost the page chrome entirely.
 *
 * Deliberately layout-agnostic: the root boundary renders outside DashboardShell,
 * so this component must not assume the app shell around it.
 *
 * Visual language matches EmptyState — same dashed surface, same icon tile, same
 * type steps — so "nothing here" and "this broke" read as one family. The tone is
 * `danger` rather than `destructive`: this is status feedback, not a destructive
 * action.
 */
export interface ErrorStateProps {
  /** Short scope label, e.g. "Matches". Rendered as the eyebrow. */
  scope?: string;
  /** One sentence, specific to what failed. */
  title: string;
  /** Optional extra guidance. A sensible default is supplied. */
  description?: string;
  /** The error from Next's error boundary. Its `digest` is surfaced for support. */
  error?: Error & { digest?: string };
  /** Next's `reset`. When omitted the retry button is not rendered. */
  reset?: () => void;
  className?: string;
}

const DEFAULT_DESCRIPTION =
  "This is usually temporary. Try again below — if it keeps happening, let the team know so we can look into it.";

export function ErrorState({
  scope,
  title,
  description = DEFAULT_DESCRIPTION,
  error,
  reset,
  className
}: ErrorStateProps) {
  // Surface the real error to the console for support; Next only gives the user a digest.
  useEffect(() => {
    if (error) console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className={cn(
        'flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted p-8 text-center text-foreground',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-danger-subtle ring-1 ring-danger/30">
        <AlertTriangle className="h-5 w-5 text-danger" aria-hidden />
      </div>
      {scope ? <p className="eyebrow mt-5">{scope}</p> : null}
      <h1 className={cn('text-lg font-semibold text-foreground', scope ? 'mt-2' : 'mt-5')}>{title}</h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">{description}</p>
      {reset ? (
        <Button type="button" className="mt-5" onClick={() => reset()}>
          Try again
        </Button>
      ) : null}
      {error?.digest ? (
        <p className="mt-3 text-label text-muted-foreground">
          Reference: <span className="font-mono tabular-nums">{error.digest}</span>
        </p>
      ) : null}
    </div>
  );
}
