'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * Cursor Grid — a lattice whose cells illuminate around the pointer and fade
 * back out (adapted from React Bits' "Cursor Grid"). Reads as instrumentation
 * lighting up under the cursor rather than a field of drifting dots.
 *
 * Two properties make it cheap enough for the CTA band:
 *  - IDLE-STOP: when no cell is lit and no pulse is expanding the rAF is not
 *    rescheduled at all, so a parked pointer costs nothing. `gridOpacity > 0`
 *    means the last frame painted the faint lattice, which then simply stays on
 *    screen — the static frame needs no special-case code path;
 *  - the loop is additionally gated on viewport intersection and tab visibility,
 *    and stops the moment either goes false rather than finishing the fade.
 *
 * `interactive` false (pre-mount, reduced motion) binds no pointer listeners and
 * paints the lattice exactly once. The markup is identical either way — motion
 * preference must never change the rendered tree.
 */

const FALLOFF_CURVES = {
    linear: (t: number) => t,
    smooth: (t: number) => t * t * (3 - 2 * t),
    sharp: (t: number) => t * t * t,
} as const;

export type CursorGridFalloff = keyof typeof FALLOFF_CURVES;

/**
 * Allocation ceiling. At 4K/70px the lattice is ~1.7k cells, but a 6K display
 * would blow the per-frame budget — past this the cell size is coarsened instead.
 */
const MAX_CELLS = 3000;
/** Fallback tint (indigo-400) when `color` isn't parseable hex. */
const FALLBACK_RGB = '129,140,248';

/** `r,g,b` triplet for interpolation into rgba() strings. */
function toRgb(color: string): string {
    const hex = color.trim().replace('#', '');
    const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
    const n = Number.parseInt(full, 16);
    if (full.length !== 6 || Number.isNaN(n)) return FALLBACK_RGB;
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

interface CursorGridProps {
    /** Target lattice pitch in CSS px; coarsened if the cell count would exceed MAX_CELLS. */
    cellSize?: number;
    /** Hex only. Indigo by default — this page has one accent. */
    color?: string;
    /** Illumination radius around the pointer, in CSS px. */
    radius?: number;
    falloff?: CursorGridFalloff;
    /** ms a cell holds its brightness after last being touched. */
    holdTime?: number;
    /** ms for a full-brightness cell to fade to nothing. */
    fadeDuration?: number;
    lineWidth?: number;
    maxOpacity?: number;
    /** Cell fill as a fraction of the cell's current alpha. 0 = outline only. */
    fillOpacity?: number;
    /** Always-on lattice alpha. Keep > 0: it is also the static/reduced-motion frame. */
    gridOpacity?: number;
    cellRadius?: number;
    clickPulse?: boolean;
    /** Ring expansion speed, CSS px per second. */
    pulseSpeed?: number;
    /** False binds no pointer listeners and paints the static lattice only. */
    interactive?: boolean;
    className?: string;
}

export function CursorGrid({
    cellSize = 70,
    color = '#818cf8',
    radius = 140,
    falloff = 'smooth',
    holdTime = 400,
    fadeDuration = 800,
    lineWidth = 1.2,
    maxOpacity = 1,
    fillOpacity = 0,
    gridOpacity = 0.05,
    cellRadius = 0,
    clickPulse = true,
    pulseSpeed = 600,
    interactive = true,
    className,
}: CursorGridProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Visual props are read through a ref so changing them never re-runs the
    // effect (which would reallocate the lattice and rebind listeners).
    const propsRef = useRef({
        radius,
        falloff,
        holdTime,
        fadeDuration,
        lineWidth,
        maxOpacity,
        fillOpacity,
        gridOpacity,
        cellRadius,
        clickPulse,
        pulseSpeed,
        rgb: toRgb(color),
    });
    propsRef.current = {
        radius,
        falloff,
        holdTime,
        fadeDuration,
        lineWidth,
        maxOpacity,
        fillOpacity,
        gridOpacity,
        cellRadius,
        clickPulse,
        pulseSpeed,
        rgb: toRgb(color),
    };

    // `color`/`gridOpacity` are in the deps because they define the static frame,
    // which for a non-interactive mount is the only paint that ever happens.
    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let width = 0;
        let height = 0;
        let step = cellSize;
        let cols = 0;
        let rows = 0;
        let offX = 0;
        let offY = 0;
        // One entry per cell, row-major, allocated in rebuild() — never per frame.
        let alphas = new Float32Array(0);
        let touched = new Float64Array(0);
        let pulses: { x: number; y: number; t0: number }[] = [];

        let raf = 0;
        let resizeRaf = 0;
        let running = false;
        let lastFrame = 0;
        let onScreen = true;
        // Rebuild key: skip the work when nothing that affects the lattice moved.
        let lastKey = '';

        /** Faint always-on lattice, batched into one path: all verticals, then all horizontals. */
        const strokeLattice = () => {
            const { rgb, gridOpacity: alpha } = propsRef.current;
            ctx.beginPath();
            for (let c = 0; c <= cols; c += 1) {
                const x = Math.round(offX + c * step) + 0.5;
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
            }
            for (let r = 0; r <= rows; r += 1) {
                const y = Math.round(offY + r * step) + 0.5;
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
            }
            ctx.lineWidth = 1;
            ctx.strokeStyle = `rgba(${rgb},${alpha})`;
            ctx.stroke();
        };

        const paintStatic = () => {
            ctx.clearRect(0, 0, width, height);
            if (propsRef.current.gridOpacity > 0) strokeLattice();
        };

        const rebuild = () => {
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = container.clientWidth;
            const h = container.clientHeight;
            const key = `${Math.round(w)}x${Math.round(h)}@${dpr}`;
            if (key === lastKey) return;
            lastKey = key;

            width = w;
            height = h;
            canvas.width = Math.max(1, Math.round(width * dpr));
            canvas.height = Math.max(1, Math.round(height * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Coarsen rather than allocate on very large viewports.
            step = Math.max(8, cellSize);
            const count = () => (Math.ceil(width / step) + 1) * (Math.ceil(height / step) + 1);
            while (count() > MAX_CELLS) step = Math.ceil(step * 1.2);

            cols = Math.ceil(width / step) + 1;
            rows = Math.ceil(height / step) + 1;
            // Centred, so the lattice crops evenly at both edges.
            offX = (width - cols * step) / 2;
            offY = (height - rows * step) / 2;
            alphas = new Float32Array(cols * rows);
            touched = new Float64Array(cols * rows);
            pulses = [];

            // Reallocating the bitmap clears it — repaint even when idle-stopped.
            paintStatic();
        };

        const stop = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = 0;
            running = false;
        };

        const litSomewhere = () => {
            if (pulses.length > 0) return true;
            for (let i = 0; i < alphas.length; i += 1) if (alphas[i] > 0) return true;
            return false;
        };

        const draw = (now: number) => {
            raf = 0;
            // Offscreen or backgrounded: drop the loop mid-fade, same as the old field.
            if (!onScreen || document.hidden) {
                running = false;
                return;
            }

            const {
                rgb,
                holdTime: hold,
                fadeDuration: fade,
                lineWidth: lw,
                maxOpacity: maxA,
                fillOpacity: fillA,
                gridOpacity: gridA,
                cellRadius: round,
                clickPulse: pulseOn,
                pulseSpeed: pulseV,
            } = propsRef.current;
            const dt = Math.min(now - lastFrame, 50);
            lastFrame = now;

            ctx.clearRect(0, 0, width, height);
            if (gridA > 0) strokeLattice();

            if (pulseOn && pulses.length > 0) {
                const diag = Math.hypot(width, height);
                const band = step;
                for (let i = pulses.length - 1; i >= 0; i -= 1) {
                    const pulse = pulses[i];
                    const ringR = ((now - pulse.t0) / 1000) * pulseV;
                    if (ringR > diag) {
                        pulses.splice(i, 1);
                        continue;
                    }
                    // Only the annulus the ring currently crosses — a whole-lattice
                    // sweep per pulse per frame is O(cells) for ~4s per click and
                    // holds the idle-stop open.
                    const rOuter = ringR + band / 2;
                    const minRow = Math.max(0, Math.floor((pulse.y - rOuter - offY) / step));
                    const maxRow = Math.min(rows - 1, Math.floor((pulse.y + rOuter - offY) / step));
                    const minCol = Math.max(0, Math.floor((pulse.x - rOuter - offX) / step));
                    const maxCol = Math.min(cols - 1, Math.floor((pulse.x + rOuter - offX) / step));
                    for (let row = minRow; row <= maxRow; row += 1) {
                        const cy = offY + row * step + step / 2;
                        for (let col = minCol; col <= maxCol; col += 1) {
                            const cx = offX + col * step + step / 2;
                            if (Math.abs(Math.hypot(cx - pulse.x, cy - pulse.y) - ringR) > band / 2) continue;
                            const idx = row * cols + col;
                            alphas[idx] = maxA;
                            touched[idx] = now;
                        }
                    }
                }
            }

            const fadeStep = dt / Math.max(fade, 16);
            const inner = step * 0.05;
            const size = step - 1;
            let anyVisible = pulses.length > 0;

            for (let row = 0; row < rows; row += 1) {
                for (let col = 0; col < cols; col += 1) {
                    const idx = row * cols + col;
                    let a = alphas[idx];
                    if (a <= 0) continue;
                    // A cell only starts fading once its hold has expired.
                    if (now - touched[idx] > hold) {
                        a = Math.max(0, a - fadeStep);
                        alphas[idx] = a;
                    }
                    if (a <= 0) continue;
                    anyVisible = true;

                    const cx = offX + col * step + step / 2;
                    const cy = offY + row * step + step / 2;
                    const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, step);
                    grad.addColorStop(0, `rgba(${rgb},${a})`);
                    grad.addColorStop(1, `rgba(${rgb},0)`);

                    ctx.beginPath();
                    // roundRect is not in every supported engine, and is pointless at radius 0.
                    if (round > 0 && typeof ctx.roundRect === 'function') {
                        ctx.roundRect(cx - size / 2, cy - size / 2, size, size, round);
                    } else {
                        ctx.rect(cx - size / 2, cy - size / 2, size, size);
                    }
                    if (fillA > 0) {
                        ctx.fillStyle = `rgba(${rgb},${a * fillA})`;
                        ctx.fill();
                    }
                    ctx.lineWidth = lw;
                    ctx.strokeStyle = grad;
                    ctx.stroke();
                }
            }

            // THE IDLE-STOP: nothing lit means no next frame at all. The faint
            // lattice just painted stays on screen as the resting state.
            if (anyVisible) {
                raf = requestAnimationFrame(draw);
            } else {
                running = false;
                if (gridA <= 0) ctx.clearRect(0, 0, width, height);
            }
        };

        const wake = () => {
            if (running || !onScreen || document.hidden) return;
            running = true;
            lastFrame = performance.now();
            raf = requestAnimationFrame(draw);
        };

        const energize = (x: number, y: number, boost = 1) => {
            const { radius: r0, falloff: curve, maxOpacity: maxA } = propsRef.current;
            const ease = FALLOFF_CURVES[curve] ?? FALLOFF_CURVES.smooth;
            const now = performance.now();
            // Only the cell range inside the radius box — never the whole lattice.
            const minCol = Math.max(0, Math.floor((x - r0 - offX) / step));
            const maxCol = Math.min(cols - 1, Math.ceil((x + r0 - offX) / step));
            const minRow = Math.max(0, Math.floor((y - r0 - offY) / step));
            const maxRow = Math.min(rows - 1, Math.ceil((y + r0 - offY) / step));

            for (let row = minRow; row <= maxRow; row += 1) {
                const cy = offY + row * step + step / 2;
                for (let col = minCol; col <= maxCol; col += 1) {
                    const cx = offX + col * step + step / 2;
                    const dist = Math.hypot(cx - x, cy - y);
                    if (dist > r0) continue;
                    const idx = row * cols + col;
                    const level = ease(1 - dist / r0) * maxA * boost;
                    if (level > alphas[idx]) {
                        alphas[idx] = level;
                        touched[idx] = now;
                    } else if (level > 0) {
                        touched[idx] = now;
                    }
                }
            }
        };

        const observer = new ResizeObserver(() => {
            // One rAF of debounce; rebuild() then no-ops if the dimensions held.
            if (resizeRaf) return;
            resizeRaf = requestAnimationFrame(() => {
                resizeRaf = 0;
                rebuild();
            });
        });
        observer.observe(container);
        rebuild();

        if (!interactive) {
            return () => {
                if (resizeRaf) cancelAnimationFrame(resizeRaf);
                observer.disconnect();
            };
        }

        /**
         * Canvas-local coordinates. The rect already accounts for ancestor
         * transforms (this band is inside a parallax translate), and the ratio
         * normalises any scale back into layout px.
         */
        const toLocal = (event: PointerEvent) => {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return null;
            return {
                x: ((event.clientX - rect.left) / rect.width) * width,
                y: ((event.clientY - rect.top) / rect.height) * height,
            };
        };

        const onPointerMove = (event: PointerEvent) => {
            const point = toLocal(event);
            if (!point) return;
            energize(point.x, point.y);
            wake();
        };

        const onPointerDown = (event: PointerEvent) => {
            if (!propsRef.current.clickPulse) return;
            const point = toLocal(event);
            if (!point) return;
            // Drumming must not stack unbounded concurrent sweeps (each one keeps
            // anyVisible true for its whole ~4s expansion).
            if (pulses.length >= 3) pulses.shift();
            pulses.push({ x: point.x, y: point.y, t0: performance.now() });
            wake();
        };

        const io = new IntersectionObserver(
            ([entry]) => {
                onScreen = entry?.isIntersecting ?? true;
                if (!onScreen) stop();
                else if (litSomewhere()) wake();
            },
            { threshold: 0 },
        );
        io.observe(container);

        const onVisibility = () => {
            if (document.hidden) stop();
            else if (litSomewhere()) wake();
        };

        document.addEventListener('visibilitychange', onVisibility);
        container.addEventListener('pointermove', onPointerMove, { passive: true });
        container.addEventListener('pointerdown', onPointerDown, { passive: true });

        return () => {
            stop();
            if (resizeRaf) cancelAnimationFrame(resizeRaf);
            resizeRaf = 0;
            observer.disconnect();
            io.disconnect();
            document.removeEventListener('visibilitychange', onVisibility);
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerdown', onPointerDown);
        };
    }, [cellSize, interactive, color, gridOpacity]);

    return (
        <div
            ref={containerRef}
            aria-hidden
            className={cn('relative h-full w-full overflow-hidden', className)}
        >
            <canvas ref={canvasRef} className="block h-full w-full" />
        </div>
    );
}
