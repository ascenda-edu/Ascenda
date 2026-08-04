'use client';

import { Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * One section of the Review step.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 * Four flat cards of `<span>label</span><br/>value`, which had three problems.
 *
 * It used `<br/>` inside a div, so a screen reader read the whole card as one
 * run: "Name Amara Okonkwo Email amara@school.example Nationality …". These are
 * label/value pairs and `<dl>` is what says so.
 *
 * It showed FOUR of the five steps — everything the student entered on
 * "Life at university" was simply absent from the summary, so a review screen
 * could not be used to check it.
 *
 * And an unanswered optional step rendered as an empty card, which reads as
 * something being broken rather than as an invitation. Empty booster sections now
 * say what they are for and offer a way in.
 *
 * A review screen exists so somebody can catch a mistake before it is saved, so
 * the completeness dot mirrors the rail rather than inventing a third vocabulary.
 */

interface ReviewRow {
  label: string;
  value: string | null;
}

interface ReviewSectionProps {
  title: string;
  rows: ReviewRow[];
  done: boolean;
  /** Booster sections say so, and get an invitation instead of a blank when empty. */
  optional?: boolean;
  /** Shown in place of the rows when a booster section has nothing in it. */
  emptyPrompt?: string;
  /**
   * Label for the empty-state button. Explicit rather than derived from `title`,
   * which produced "Add lifestyle" — the step titles are section names, not object
   * phrases, so they do not all read as the tail of a verb.
   */
  emptyCta?: string;
  onEdit: () => void;
  editLabel: string;
}

export function ReviewSection({
  title,
  rows,
  done,
  optional = false,
  emptyPrompt,
  emptyCta,
  onEdit,
  editLabel
}: ReviewSectionProps) {
  const filled = rows.filter((row) => row.value);
  const isEmpty = filled.length === 0;

  return (
    <div className="surface-subcard !p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* Same three-state treatment as the rail's dots — one completion
            * vocabulary across the whole wizard, not one per surface. */}
          <span
            aria-hidden
            className={cn(
              'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
              done ? 'border-success bg-success-subtle' : 'border-border'
            )}
          >
            {done ? <Check className="h-2.5 w-2.5 text-success" /> : null}
          </span>
          <h3 className="truncate text-body-sm font-semibold text-foreground">{title}</h3>
          {optional ? <span className="surface-chip shrink-0 !px-2 !py-0.5 text-label">Optional</span> : null}
          {done ? <span className="sr-only">(complete)</span> : null}
        </div>

        <button
          type="button"
          onClick={onEdit}
          className="-my-2 shrink-0 rounded-lg px-3 py-3.5 text-xs font-semibold text-primary-ink transition-colors hover:bg-primary/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Edit
          {/* The visible word is "Edit" on all six; the accessible name says which. */}
          <span className="sr-only"> {editLabel}</span>
        </button>
      </div>

      {isEmpty ? (
        <div className="mt-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {emptyPrompt ?? 'Nothing added yet.'}
          </p>
          {optional ? (
            <button
              type="button"
              onClick={onEdit}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/8 px-4 py-3.5 text-xs font-semibold text-primary-ink transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Plus className="h-3 w-3" aria-hidden />
              {emptyCta ?? `Add ${title.toLowerCase()}`}
            </button>
          ) : null}
        </div>
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {filled.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-label uppercase tracking-widest text-muted-foreground">{row.label}</dt>
              <dd className="break-words text-body-sm text-foreground">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
