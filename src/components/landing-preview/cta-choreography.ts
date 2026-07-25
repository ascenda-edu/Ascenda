/**
 * The two choreography points the launch finale and the companion bar have to
 * agree on, in their own module so importing the contract doesn't import the
 * finale. `preview-nav` needs these on the page's first chunk; `preview-cta` is
 * ~1,500 lines plus the cursor grid and the rocket art, and pulling it in for two
 * numbers defeats the lazy boundary in `app/landing-preview/page.tsx`.
 *
 * No 'use client' directive: plain constants, shared by both sides untouched.
 */

export const IGNITION: [number, number] = [0.7, 0.78];
/** Ignition as a fraction of the pin travel — preview-nav lands its READY here. */
export const CTA_IGNITION_POINT = IGNITION[0];

export const COPY: [number, number] = [0.42, 0.58];
/** Where the ask is legible — the countdown chip's jump target. */
export const CTA_COPY_POINT = COPY[1];
