'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { countUnlocked, type UnlockEntry } from '@/lib/profile/wizard-unlocks';

/**
 * Renders the unlocks ledger. Purely presentational — `buildUnlocks` derives the
 * entries, this decides how they arrive.
 *
 * ── THE ANNOUNCEMENT IS DIFFED, NOT MIRRORED ─────────────────────────────────
 * The obvious implementation puts `aria-live="polite"` on the list and lets the DOM
 * speak for itself. That is unusable: the list re-renders on every keystroke, so a
 * screen-reader user hears all seven entries read out while typing a school name.
 *
 * So the live region is a SEPARATE node holding only what changed, and it is
 * written only when an entry flips from locked to unlocked. Two consequences worth
 * keeping: the region lives outside the list (replacing a live region's own
 * container does not reliably re-announce in every screen reader), and re-locking an
 * entry is silent — telling someone they have just lost a capability because they
 * cleared a field mid-edit is noise, not information.
 */
export function UnlocksLedger({ entries }: { entries: readonly UnlockEntry[] }) {
  const unlockedCount = countUnlocked(entries);

  /** Ids already unlocked, so only genuinely new ones pulse and announce. */
  const seenRef = useRef<Set<string> | null>(null);
  const [freshIds, setFreshIds] = useState<readonly string[]>([]);
  const [announcement, setAnnouncement] = useState('');

  /**
   * Whether the baseline has settled.
   *
   * The baseline CANNOT be taken on the first effect run. `StudentIntakeForm`
   * hydrates a saved profile (or a local draft) in its own mount effect, so on the
   * first run these entries still describe an empty form — and the hydration that
   * lands a tick later then looks exactly like the student unlocking five things at
   * once. Measured: a returning student got five entries pulsed and read aloud on
   * arrival, a fanfare for work they did last week.
   *
   * So the baseline is deferred by a macrotask, which is after every mount effect has
   * flushed. Announcements before that point are suppressed rather than queued: they
   * are not the student's actions.
   */
  const settledRef = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => { settledRef.current = true; }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const nowUnlocked = entries.filter((e) => e.unlocked).map((e) => e.id);

    // Re-baseline on every pre-settle run, so whatever hydration produces becomes the
    // starting point rather than the first announcement.
    if (!settledRef.current || seenRef.current === null) {
      seenRef.current = new Set(nowUnlocked);
      return;
    }

    const seen = seenRef.current;
    const fresh = nowUnlocked.filter((id) => !seen.has(id));
    // Drop entries that have become locked again so they can announce if re-earned.
    Array.from(seen).forEach((id) => {
      if (!nowUnlocked.includes(id)) seen.delete(id);
    });
    if (fresh.length === 0) return;
    fresh.forEach((id) => seen.add(id));

    setFreshIds(fresh);
    setAnnouncement(
      `Unlocked: ${fresh
        .map((id) => entries.find((e) => e.id === id)?.text ?? '')
        .filter(Boolean)
        .join('. ')}.`
    );
  }, [entries]);

  // Clear the pulse class after it has played, so a later unrelated re-render does
  // not replay it.
  useEffect(() => {
    if (freshIds.length === 0) return;
    const timer = window.setTimeout(() => setFreshIds([]), 1200);
    return () => window.clearTimeout(timer);
  }, [freshIds]);

  return (
    <section className="surface-card rounded-3xl !p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="eyebrow">What we can do with this so far</h2>
        <span className="text-label font-bold tabular-nums text-muted-foreground">
          {unlockedCount}/{entries.length}
        </span>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-x-5">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              '-mx-1 flex items-start gap-2.5 rounded-lg px-1 py-0.5 text-body-sm leading-snug transition-colors',
              entry.unlocked ? 'font-medium text-foreground' : 'text-muted-foreground',
              freshIds.includes(entry.id) && 'motion-safe:animate-unlock-flash'
            )}
          >
            <span
              aria-hidden
              className={cn(
                'mt-0.5 flex h-[1.0625rem] w-[1.0625rem] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
                entry.unlocked
                  ? 'border-success-fill bg-success-fill text-card'
                  : 'border-primary/25'
              )}
            >
              {entry.unlocked ? <Check className="h-2.5 w-2.5" /> : null}
            </span>
            <span>
              {entry.text}
              {entry.unlocked ? null : (
                <span className="font-normal text-muted-foreground"> — {entry.need}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* Outside the <ul> deliberately — see the header. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
