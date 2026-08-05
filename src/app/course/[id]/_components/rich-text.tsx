'use client';

import { Fragment } from 'react';
import { cn } from '@/lib/utils';
import { parseTextBlocks, splitSentences } from './course-data';

/**
 * Wrapper for the DB-sourced prose on this page.
 *
 * `@tailwindcss/typography` is bound to our tokens in tailwind.config.ts, so
 * `prose` now actually paints — which is why the old stack had to go. It was
 * `prose prose-lg dark:prose-invert max-w-4xl text-muted-foreground`, which is
 * three problems at once:
 *   - `prose-lg` sets an 18px body, above `text-base` (16px), the top of the
 *     type scale for body copy;
 *   - `dark:prose-invert` is dead weight — the config points the `-invert-*`
 *     variables at the same tokens, which already flip under [data-theme=dark]
 *     — and a `dark:` colour variant is against the house rules anyway;
 *   - `text-muted-foreground` now competes with `--tw-prose-body` on the same element (only since this branch installed the typography plugin — on main `prose` emitted nothing at all, so there was no conflict to have)*     same element, so the intended text colour depended on layer order.
 */
export const RICH_TEXT_CLASS = 'prose max-w-3xl';

/** Renders `**bold**` spans from the DB copy; everything else is literal. */
export const emphasize = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((chunk, idx) => {
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return <strong key={`${chunk}-${idx}`}>{chunk.slice(2, -2)}</strong>;
    }
    return <Fragment key={`${chunk}-${idx}`}>{chunk}</Fragment>;
  });

export const renderRichText = (text?: string | null, options?: { forceBullets?: boolean }) => {
  const { forceBullets = false } = options ?? {};
  const { intro, bullets } = parseTextBlocks(text);
  const fallbackSentences = forceBullets && text ? splitSentences(text.replace(/\r/g, '')) : [];
  const hasContent = intro.length || bullets.length || fallbackSentences.length;

  if (!hasContent) return <p className="text-muted-foreground">No information available.</p>;

  const finalBullets = bullets.length ? bullets : fallbackSentences;

  return (
    <div className="space-y-3">
      {intro.map((para, idx) => (
        <p key={`intro-${idx}`} className="text-foreground leading-relaxed">
          {emphasize(para)}
        </p>
      ))}
      {finalBullets.length ? (
        <ul className="space-y-3 not-prose">
          {finalBullets.map((item, idx) => (
            <li key={`bullet-${idx}`} className="flex items-start gap-3">
              <span className="mt-2.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
              <span className="text-foreground leading-relaxed">{emphasize(item)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

/**
 * `renderRichText` plus the prose wrapper, so no call site has to remember the
 * class stack. Every consumer wrapped it in an identically-classed div before.
 */
export const RichText = ({
  text,
  forceBullets,
  className
}: {
  text?: string | null;
  forceBullets?: boolean;
  className?: string;
}) => <div className={cn(RICH_TEXT_CLASS, className)}>{renderRichText(text, { forceBullets })}</div>;
