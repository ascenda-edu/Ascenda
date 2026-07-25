'use client';

import { useId } from 'react';
import {
    motion,
    useMotionValue,
    useTransform,
    type MotionStyle,
    type MotionValue,
} from 'framer-motion';

/**
 * Hand-built launch vehicle for the CTA finale — deliberately not an icon: the
 * assembly choreography needs every part as its own transformable group, and the
 * hull carries three module bays whose LEDs light as the widget cards dock.
 *
 * The art is the Ascenda mascot (public/ascenda-rocket.png) redrawn upright:
 * flat cartoon fills, bold navy ink outlines, teal hull with a cream highlight
 * panel, amber nose and fins, and the smiling violet porthole face that is the
 * mascot's defining feature. Palette values below are sampled from that PNG.
 * The logo is drawn tilted; the scene launches vertically, so only the styling
 * is borrowed, never the rotation.
 *
 * Three constraints shape the implementation:
 *  1. Every group renders DOCKED (its final frame) when no motion style is
 *     passed, so the SSR/reduced-motion payload is the assembled rocket.
 *  2. SVG defs are global to the document, so gradient ids are namespaced per
 *     instance with useId() — two mounted RocketArts must not collide.
 *  3. No SVG filters on animated nodes: a `filter` on a node whose scale is
 *     scrubbed re-rasterises the filter graph every frame. The exhaust puffs use
 *     pre-blurred radial gradients instead.
 */

export type RocketGroupId = 'gHull' | 'gNose' | 'gFinL' | 'gFinR' | 'gEngine';

/** Natural size — the scene renders the art 1:1, so viewBox units are px. */
export const ROCKET_WIDTH = 220;
export const ROCKET_HEIGHT = 248;

/** Bay centres in viewBox units: the docking targets for the module cards. */
export const ROCKET_BAYS = [
    { x: 110, y: 117 },
    { x: 110, y: 141 },
    { x: 110, y: 165 },
] as const;

/**
 * Transform origins per group, chosen so a single translate/rotate reads as the
 * part *docking*: the nose pivots on the seam it lands on, each fin on its root.
 */
const ORIGINS: Record<RocketGroupId, string> = {
    gHull: 'center',
    gNose: 'center bottom',
    gFinL: '100% 50%',
    gFinR: '0% 50%',
    gEngine: 'center top',
};

/**
 * Mascot palette, sampled from public/ascenda-rocket.png. `CREAM` is the one
 * invention: the logo's highlight panel is a knockout to transparency, which
 * would read as a hole on this band's slate-950 backdrop, so it is painted the
 * warm off-white the logo reads as on paper.
 */
const INK = '#202050';
const CREAM = '#faf6ee';
const TEAL_SHADE = '#40b0a0';
const AMBER_SHADE = '#dfa417';
const AMBER_LIGHT = '#ffe06a';
const VIOLET_TRIM = '#8b7ec8';
const FACE_INK = '#3a2c63';

const BAY_LED_LIT = '#34d399';
const BAY_LED_DARK = '#2f2f5e';

/** Outline weight — the single strongest signal of the mascot's flat style. */
const OUTLINE = 2.8;

export interface RocketArtProps {
    /**
     * Per-group assembly transforms. A group left out renders docked, which is
     * what SSR and reduced-motion users see.
     */
    groups?: Partial<Record<RocketGroupId, MotionStyle>>;
    /** Bay LEDs lit, 0–3. Defaults to all three (the settled frame). */
    litBays?: number;
    /** 0→1 flame intensity. Omitted ⇒ unlit, still on the pad. */
    flame?: MotionValue<number>;
    /** 0→1 smoke drift. Omitted ⇒ no exhaust. */
    smoke?: MotionValue<number>;
    /** Run the flame flicker loop. Only pass true while the flame is lit. */
    flicker?: boolean;
    className?: string;
}

export function RocketArt({
    groups,
    litBays = ROCKET_BAYS.length,
    flame,
    smoke,
    flicker = false,
    className,
}: RocketArtProps) {
    // Per-instance def namespace. useId() can contain characters that are not
    // valid in CSS selectors, so it is reduced to word chars before going into
    // an id / url(#…) reference.
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
    const defId = (name: string) => `ra-${uid}-${name}`;
    const defUrl = (name: string) => `url(#${defId(name)})`;

    // Fallback source so the derived transforms below are unconditional hooks;
    // it stays at 0, which is exactly "no flame, no smoke".
    const rest = useMotionValue(0);
    const flameSrc = flame ?? rest;
    const smokeSrc = smoke ?? rest;

    const flameOpacity = useTransform(flameSrc, [0, 0.12, 1], [0, 0.7, 1]);
    const flameScaleY = useTransform(flameSrc, [0, 1], [0.3, 1]);
    const flameScaleX = useTransform(flameSrc, [0, 1], [0.7, 1]);
    const coreOpacity = useTransform(flameSrc, [0.2, 1], [0, 0.95]);

    const smokeOpacity = useTransform(smokeSrc, [0, 0.25, 1], [0, 0.45, 0]);
    const smokeScale = useTransform(smokeSrc, [0, 1], [0.45, 1.6]);
    const smokeLeftX = useTransform(smokeSrc, [0, 1], [6, -34]);
    const smokeRightX = useTransform(smokeSrc, [0, 1], [-6, 36]);
    const smokeY = useTransform(smokeSrc, [0, 1], [0, -10]);

    const groupStyle = (id: RocketGroupId): MotionStyle => ({
        transformBox: 'fill-box',
        transformOrigin: ORIGINS[id],
        ...groups?.[id],
    });

    return (
        <svg
            viewBox={`0 0 ${ROCKET_WIDTH} ${ROCKET_HEIGHT}`}
            width={ROCKET_WIDTH}
            height={ROCKET_HEIGHT}
            className={className}
            style={{ overflow: 'visible' }}
            aria-hidden
            focusable="false"
        >
            <defs>
                {/* Flat-cartoon fills: two close stops each, just enough to give
                    the tube a roll without reading as chrome. */}
                <linearGradient id={defId('hull')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5cdcc0" />
                    <stop offset="100%" stopColor="#48c6a8" />
                </linearGradient>
                <linearGradient id={defId('nose')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f9d13a" />
                    <stop offset="100%" stopColor="#efb816" />
                </linearGradient>
                <linearGradient id={defId('fin')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f8cc28" />
                    <stop offset="100%" stopColor="#eeb417" />
                </linearGradient>
                {/* Lifted off pure navy: the band behind is slate-950, and the
                    logo's own ink would swallow the bell whole. */}
                <linearGradient id={defId('engine')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4a4a84" />
                    <stop offset="100%" stopColor="#2e2e5e" />
                </linearGradient>
                {/* Porthole glass runs light — the mascot's face is dark ink on a
                    pale violet lens, not a lit-from-within cockpit. */}
                <radialGradient id={defId('glass')} cx="34%" cy="28%" r="82%">
                    <stop offset="0%" stopColor="#c9b6ea" />
                    <stop offset="100%" stopColor="#9d86cb" />
                </radialGradient>
                <radialGradient id={defId('porthole-glow')} cx="50%" cy="50%" r="50%">
                    <stop offset="55%" stopColor="#a690d0" stopOpacity="0.5" />
                    <stop offset="100%" stopColor="#a690d0" stopOpacity="0" />
                </radialGradient>
                {/* The mascot's exhaust is an amber zig-zag with a white heart, so
                    the plume carries the brand's amber rather than the page accent:
                    the rocket IS the mark here, and matching it beats palette
                    discipline. */}
                <linearGradient id={defId('flame')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fff0b8" />
                    <stop offset="40%" stopColor="#f0c020" />
                    <stop offset="100%" stopColor="#f0c020" stopOpacity="0.35" />
                </linearGradient>
                <linearGradient id={defId('flame-core')} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#ffe27a" stopOpacity="0.6" />
                </linearGradient>
                {/* Soft-edged fill standing in for a Gaussian blur: the puffs are
                    scale-animated, and a filter would re-rasterise per frame.
                    Deliberately left neutral slate — coloured smoke would read as
                    a second flame. */}
                <radialGradient id={defId('smoke')} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.9" />
                    <stop offset="42%" stopColor="#cbd5e1" stopOpacity="0.6" />
                    <stop offset="72%" stopColor="#cbd5e1" stopOpacity="0.24" />
                    <stop offset="100%" stopColor="#cbd5e1" stopOpacity="0" />
                </radialGradient>
            </defs>

            {/* Exhaust puffs sit behind the vehicle so they read as billowing past it. */}
            <motion.g style={{ opacity: smokeOpacity }}>
                <motion.circle
                    cx={74}
                    cy={212}
                    r={24}
                    fill={defUrl('smoke')}
                    fillOpacity={0.5}
                    style={{
                        transformBox: 'fill-box',
                        transformOrigin: 'center',
                        x: smokeLeftX,
                        y: smokeY,
                        scale: smokeScale,
                    }}
                />
                <motion.circle
                    cx={146}
                    cy={216}
                    r={27}
                    fill={defUrl('smoke')}
                    fillOpacity={0.42}
                    style={{
                        transformBox: 'fill-box',
                        transformOrigin: 'center',
                        x: smokeRightX,
                        y: smokeY,
                        scale: smokeScale,
                    }}
                />
            </motion.g>

            {/* Engine bell — docks up into the hull skirt from below. Its fill
                geometry starts at y=184 so `center top` stays on the seam. */}
            <motion.g id="gEngine" style={groupStyle('gEngine')}>
                <path
                    d="M88 184 L132 184 L138 205 Q138 212 130.5 212 L89.5 212 Q82 212 82 205 Z"
                    fill={defUrl('engine')}
                    stroke={INK}
                    strokeWidth={OUTLINE}
                    strokeLinejoin="round"
                />
                {/* Violet collar — the logo's purple strut band, reused as the
                    nozzle throat trim. */}
                <path
                    d="M89 184 L131 184 L132.4 191.5 L87.6 191.5 Z"
                    fill={VIOLET_TRIM}
                    stroke={INK}
                    strokeWidth={2}
                    strokeLinejoin="round"
                />
                <ellipse cx={110} cy={205.5} rx={20} ry={4.4} fill="#161636" />
            </motion.g>

            {/* Fins — swept in from the sides onto their root seams. Amber like
                the logo's, each crossed by a small violet strut band. */}
            <motion.g id="gFinL" style={groupStyle('gFinL')}>
                <path
                    d="M78 136 C62 152 53 170 51 188 C50.6 192.4 54.6 194.6 58.4 192.6 L78 182 Z"
                    fill={defUrl('fin')}
                    stroke={INK}
                    strokeWidth={OUTLINE}
                    strokeLinejoin="round"
                />
                <path
                    d="M78 173 L78 182 L58.4 192.6 C54.6 194.6 50.6 192.4 51 188 C51.7 182.6 53.2 177.4 55.4 172.4 Z"
                    fill={AMBER_SHADE}
                />
                <path d="M75 144 L62.5 161" stroke={INK} strokeWidth={8} strokeLinecap="round" />
                <path d="M75 144 L62.5 161" stroke={VIOLET_TRIM} strokeWidth={4.6} strokeLinecap="round" />
            </motion.g>
            <motion.g id="gFinR" style={groupStyle('gFinR')}>
                <path
                    d="M142 136 C158 152 167 170 169 188 C169.4 192.4 165.4 194.6 161.6 192.6 L142 182 Z"
                    fill={defUrl('fin')}
                    stroke={INK}
                    strokeWidth={OUTLINE}
                    strokeLinejoin="round"
                />
                <path
                    d="M142 173 L142 182 L161.6 192.6 C165.4 194.6 169.4 192.4 169 188 C168.3 182.6 166.8 177.4 164.6 172.4 Z"
                    fill={AMBER_SHADE}
                />
                <path d="M145 144 L157.5 161" stroke={INK} strokeWidth={8} strokeLinecap="round" />
                <path d="M145 144 L157.5 161" stroke={VIOLET_TRIM} strokeWidth={4.6} strokeLinecap="round" />
            </motion.g>

            {/* Hull — the first part on the pad; everything else lands onto it. */}
            <motion.g id="gHull" style={groupStyle('gHull')}>
                <path
                    d="M78 58 C76.2 96 76.2 140 78 174 Q78.6 184 88 184 L132 184 Q141.4 184 142 174 C143.8 140 143.8 96 142 58 Z"
                    fill={defUrl('hull')}
                    stroke={INK}
                    strokeWidth={OUTLINE}
                    strokeLinejoin="round"
                />
                {/* Cream highlight panel down the windward flank, ink-separated
                    from the teal — the logo's signature stripe. */}
                <path
                    d="M95 59.5 C91.5 98 91 140 94.5 178.5 L88 178.5 Q82 178.5 81.6 172.5 C80.2 138 80.2 96 81.4 59.5 Z"
                    fill={CREAM}
                    stroke={INK}
                    strokeWidth={2.2}
                    strokeLinejoin="round"
                />
                {/* Shade flank opposite it. */}
                <path
                    d="M133.5 59.5 C136 98 136.4 140 134 178.5 L136.5 178.5 Q141.4 178.5 141.7 172 C143 138 143 96 141.9 59.5 Z"
                    fill={TEAL_SHADE}
                />

                {/* Porthole: the mascot's face — ink ring, pale violet lens, two
                    dot eyes over a smile, and one off-centre catchlight. */}
                <circle cx={113} cy={81} r={17.4} fill={defUrl('porthole-glow')} />
                <circle
                    cx={113}
                    cy={81}
                    r={14}
                    fill={defUrl('glass')}
                    stroke={INK}
                    strokeWidth={OUTLINE}
                />
                <path
                    d="M103.2 71.2 A14 14 0 0 1 113 67"
                    fill="none"
                    stroke={CREAM}
                    strokeOpacity={0.85}
                    strokeWidth={3.2}
                    strokeLinecap="round"
                />
                <circle cx={108} cy={78} r={2.2} fill={FACE_INK} />
                <circle cx={118} cy={78} r={2.2} fill={FACE_INK} />
                <path
                    d="M107.4 84.6 C109.5 89 116.5 89 118.6 84.6"
                    fill="none"
                    stroke={FACE_INK}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                />

                {/* Three module bays — recessed teal hatches on the hull's ink
                    grammar, each with its LED and a pair of label strips. */}
                {ROCKET_BAYS.map((bay, i) => {
                    const lit = i < litBays;
                    return (
                        <g key={bay.y}>
                            <rect
                                x={97}
                                y={bay.y - 8.5}
                                width={36}
                                height={17}
                                rx={5}
                                fill={TEAL_SHADE}
                                stroke={INK}
                                strokeWidth={2.2}
                            />
                            <circle
                                cx={104.5}
                                cy={bay.y}
                                r={3.1}
                                fill={lit ? BAY_LED_LIT : BAY_LED_DARK}
                                stroke={INK}
                                strokeWidth={1.4}
                                className="transition-[fill] duration-300"
                            />
                            {lit && (
                                <circle cx={104.5} cy={bay.y} r={6.8} fill={BAY_LED_LIT} fillOpacity={0.24} />
                            )}
                            <rect
                                x={111}
                                y={bay.y - 4}
                                width={18}
                                height={1.8}
                                rx={0.9}
                                fill={CREAM}
                                fillOpacity={0.6}
                            />
                            <rect
                                x={111}
                                y={bay.y + 2.4}
                                width={11}
                                height={1.8}
                                rx={0.9}
                                fill={CREAM}
                                fillOpacity={0.44}
                            />
                        </g>
                    );
                })}
            </motion.g>

            {/* Nose cone — amber accent part, lowered onto the hull seam, with the
                cream panel carrying through to the tip. */}
            <motion.g id="gNose" style={groupStyle('gNose')}>
                <path
                    d="M110 6 C124 26 142 46 142 61 L78 61 C78 46 96 26 110 6 Z"
                    fill={defUrl('nose')}
                    stroke={INK}
                    strokeWidth={OUTLINE}
                    strokeLinejoin="round"
                />
                <path
                    d="M110 7 C98.5 26 81.4 48 81.4 60 L94.6 60 C95.2 47.5 103 28 112 14 Z"
                    fill={CREAM}
                    stroke={INK}
                    strokeWidth={2.2}
                    strokeLinejoin="round"
                />
                <path
                    d="M119 23 C125 33 130.5 44 132 53"
                    fill="none"
                    stroke={AMBER_LIGHT}
                    strokeOpacity={0.9}
                    strokeWidth={3}
                    strokeLinecap="round"
                />
                <path d="M79.5 60 L140.5 60" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
            </motion.g>

            {/* Layered plume: amber tongues + a white-hot core, the logo's zig-zag
                exhaust read vertically. Flicker only while lit — and when it
                stops, the paths animate back to rest so no residual keyframe
                transform is left behind on reverse scroll. No ink outline here:
                the plume is scaled non-uniformly, which would smear a stroke. */}
            <motion.g
                style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'center top',
                    opacity: flameOpacity,
                    scaleY: flameScaleY,
                    scaleX: flameScaleX,
                }}
            >
                <motion.path
                    d="M92 208 C92 221 96 231 104 239 L107.5 231 L110 246 L112.5 231 L116 239 C124 231 128 221 128 208 Z"
                    fill={defUrl('flame')}
                    style={{ transformBox: 'fill-box', transformOrigin: 'center top' }}
                    animate={
                        flicker
                            ? { scaleY: [1, 1.1, 0.94, 1], opacity: [1, 0.86, 1] }
                            : { scaleY: 1, opacity: 1 }
                    }
                    transition={
                        flicker
                            ? { duration: 0.42, repeat: Infinity, ease: 'easeInOut' }
                            : { duration: 0.2, ease: 'easeOut' }
                    }
                />
                {/* Core opacity stays a scrubbed style value — animating it here
                    would fight `coreOpacity`, so only scaleY has a rest target. */}
                <motion.path
                    d="M103 208 C102.8 217 105.2 224 108 230.5 L110 224.5 L112 230.5 C114.8 224 117.2 217 117 208 Z"
                    fill={defUrl('flame-core')}
                    style={{
                        transformBox: 'fill-box',
                        transformOrigin: 'center top',
                        opacity: coreOpacity,
                    }}
                    animate={flicker ? { scaleY: [1, 0.88, 1.06, 1] } : { scaleY: 1 }}
                    transition={
                        flicker
                            ? { duration: 0.3, repeat: Infinity, ease: 'easeInOut' }
                            : { duration: 0.2, ease: 'easeOut' }
                    }
                />
            </motion.g>
        </svg>
    );
}
