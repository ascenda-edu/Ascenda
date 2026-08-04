'use client';

import { useEffect, useRef, useState } from 'react';
import type { StudentProfilePayload } from './intake-types';

/**
 * Live feedback for the intake wizard: what the answers so far add up to.
 *
 * ── The fingerprint is the whole design ─────────────────────────────────────
 * A naive version would POST on every keystroke. This derives a FINGERPRINT from
 * only the fields the preview actually depends on — intended clusters, programme
 * type, and the subject grades — and refuses to fetch when it has not changed. So
 * typing a school name, a phone number, or an EE title costs nothing, and
 * re-entering a step you have already previewed costs nothing.
 *
 * Two more guards on top of it:
 *   - Nothing is requested until there is at least one intended cluster. Before
 *     that the answer is "we cannot say", and asking the server to confirm that on
 *     a timer is pure waste.
 *   - The last response wins by construction: every request carries an
 *     `AbortController`, and a superseded request is aborted rather than left to
 *     race. Without that, a slow reply for "economics" can land after a fast reply
 *     for "medicine" and the student sees a count for the field they just left.
 *
 * The debounce is 700ms rather than the ~300ms a search box would use: this is
 * reassurance, not a search result, and firing while someone is mid-way through
 * typing a grade produces a number that flickers through wrong values.
 */

const DEBOUNCE_MS = 700;

export interface IntakePreview {
  band: string | null;
  totalScore: number | null;
  /**
   * Programmes in the FIELDS the student's clusters resolve to — not a match
   * count. `null` means the server could not say (error, timeout, or no clusters).
   */
  fieldProgrammeCount: number | null;
  fieldCount: number;
}

interface UseIntakePreviewOptions {
  /** Skip entirely — e.g. after a successful submit, when the form is done. */
  enabled?: boolean;
}

/**
 * Only the inputs the preview depends on. Anything not in here can change freely
 * without costing a request.
 */
const fingerprint = (payload: StudentProfilePayload): string => {
  const academic = payload.academic_input;
  return JSON.stringify([
    academic.programme_type,
    academic.intended_clusters,
    // Grades drive the band; subject NAMES do not, but they are cheap to include
    // and a renamed subject can change the engine's subject-strength read.
    academic.subject_list?.map((subject) => [subject.subject_name, subject.level, subject.grade_value])
  ]);
};

export function useIntakePreview(
  buildPayload: () => StudentProfilePayload,
  deps: unknown,
  { enabled = true }: UseIntakePreviewOptions = {}
) {
  const [preview, setPreview] = useState<IntakePreview | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFingerprintRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // No fetch, no preview. This is a nicety bolted onto a form that must keep
    // working without it — and an unguarded call throws inside the timer below,
    // where nothing catches it. jsdom is the case that proved it.
    if (typeof fetch !== 'function') return;

    const payload = buildPayload();
    // Nothing to say without a field to count in.
    if (!payload.academic_input.intended_clusters?.length) {
      lastFingerprintRef.current = null;
      setPreview(null);
      return;
    }

    const next = fingerprint(payload);
    if (next === lastFingerprintRef.current) return;

    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      lastFingerprintRef.current = next;

      // Supersede any in-flight request so the last answer is the one shown.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      fetch('/api/profile/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: IntakePreview | null) => {
          if (controller.signal.aborted) return;
          setPreview(data);
        })
        .catch(() => {
          // Aborted, offline, or a 4xx. The preview is a nicety — it must never
          // surface an error into a form that is otherwise working. Clearing the
          // fingerprint lets the next edit retry.
          if (!controller.signal.aborted) lastFingerprintRef.current = null;
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // `deps` is the caller's change signal (the form-state memo). `buildPayload`
    // is recreated every render and is deliberately not a dependency — including
    // it would fire this effect on every render and defeat the fingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deps, enabled]);

  // Abort on unmount, so a reply cannot arrive for a form that is gone.
  useEffect(() => () => abortRef.current?.abort(), []);

  return { preview, loading };
}
