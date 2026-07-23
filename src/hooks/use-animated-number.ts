'use client';

import { useEffect, useState } from 'react';

const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/**
 * Animate a number from 0 → `target` over `duration` ms when `active` is true.
 * Returns the current (rounded) display value.
 */
export function useAnimatedNumber(
  target: number,
  active: boolean,
  duration = 1400,
) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }

    // Reduced-motion path (duration 0) — snap to the target, skip the rAF loop
    // (avoids a 0/0 → NaN edge on the first frame when now === start).
    if (duration <= 0) {
      setValue(target);
      return;
    }

    let frameId: number;
    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      setValue(easeInOutCubic(progress) * target);
      if (progress < 1) {
        frameId = requestAnimationFrame(tick);
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [active, target, duration]);

  return Math.round(value);
}
