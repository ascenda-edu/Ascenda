import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge, taught about our custom font-size classes.
 *
 * `.text-label` (11px) and `.text-body-sm` (13px) are component classes declared in
 * globals.css, so tailwind-merge doesn't know them. Left unconfigured it matches them
 * by prefix into the text-COLOUR group, which makes them rivals of every tone class —
 * and then silently drops one:
 *
 *   twMerge('text-success text-label')  ->  'text-label'    // colour gone
 *   twMerge('text-label text-success')  ->  'text-success'  // the 11px gone
 *
 * Whichever was written last won, so the outcome depended on class order. That was
 * already live in three chips in counsellor/application-overview.tsx, which had lost
 * their size.
 *
 * Registering them in `font-size` fixes every call site at once and gives the correct
 * behaviour in both directions: they no longer fight colours, and they now properly
 * override `text-xs`/`text-sm` when both are present.
 *
 * Add any future custom size class here too. `.eyebrow` needs no entry — it has no
 * `text-` prefix, so it is never group-matched.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': ['text-label', 'text-body-sm'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Initials from a name: first letter of the first two whitespace-separated
 * parts, uppercased. Falls back to '·' for an empty or blank name. */
export function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '·'
  );
}
