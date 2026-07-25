'use client';

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
 * Two constraints shape the API:
 *  1. Every group renders DOCKED (its final frame) when no motion style is
 *     passed, so the SSR/reduced-motion payload is the assembled rocket.
 *  2. Gradient/filter ids are `ra-`-prefixed — SVG defs are global to the page.
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

const BAY_LED_LIT = '#34d399';
const BAY_LED_DARK = '#334155';

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
                <linearGradient id="ra-hull" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f1f5f9" />
                    <stop offset="52%" stopColor="#cbd5e1" />
                    <stop offset="100%" stopColor="#8f9db1" />
                </linearGradient>
                <linearGradient id="ra-nose" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a5b4fc" />
                    <stop offset="55%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#4338ca" />
                </linearGradient>
                <linearGradient id="ra-fin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#dbe2ea" />
                    <stop offset="100%" stopColor="#64748b" />
                </linearGradient>
                <linearGradient id="ra-engine" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#94a3b8" />
                    <stop offset="58%" stopColor="#475569" />
                    <stop offset="100%" stopColor="#293548" />
                </linearGradient>
                <radialGradient id="ra-glass" cx="35%" cy="30%" r="80%">
                    <stop offset="0%" stopColor="#e0e7ff" />
                    <stop offset="55%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#312e81" />
                </radialGradient>
                <radialGradient id="ra-porthole-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="55%" stopColor="#818cf8" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="ra-flame" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fcd34d" />
                    <stop offset="45%" stopColor="#fb923c" />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity="0.35" />
                </linearGradient>
                <linearGradient id="ra-flame-core" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffffff" />
                    <stop offset="100%" stopColor="#fde68a" stopOpacity="0.55" />
                </linearGradient>
                <filter id="ra-smoke-blur" x="-120%" y="-120%" width="340%" height="340%">
                    <feGaussianBlur stdDeviation="6" />
                </filter>
            </defs>

            {/* Exhaust puffs sit behind the vehicle so they read as billowing past it. */}
            <motion.g style={{ opacity: smokeOpacity }}>
                <motion.circle
                    cx={74}
                    cy={212}
                    r={13}
                    fill="#cbd5e1"
                    fillOpacity={0.5}
                    filter="url(#ra-smoke-blur)"
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
                    r={15}
                    fill="#cbd5e1"
                    fillOpacity={0.42}
                    filter="url(#ra-smoke-blur)"
                    style={{
                        transformBox: 'fill-box',
                        transformOrigin: 'center',
                        x: smokeRightX,
                        y: smokeY,
                        scale: smokeScale,
                    }}
                />
            </motion.g>

            {/* Engine bell — docks up into the hull skirt from below. */}
            <motion.g id="gEngine" style={groupStyle('gEngine')}>
                <path
                    d="M88 184 L132 184 L138 206 Q138 212 131 212 L89 212 Q82 212 82 206 Z"
                    fill="url(#ra-engine)"
                    stroke="#e2e8f0"
                    strokeOpacity={0.32}
                    strokeWidth={1}
                />
                <ellipse cx={110} cy={207} rx={24} ry={4.6} fill="#0b1220" fillOpacity={0.72} />
                <path d="M96 186 L94 210" stroke="#f8fafc" strokeOpacity={0.22} strokeWidth={1.4} />
                <path d="M124 186 L126 210" stroke="#0b1220" strokeOpacity={0.28} strokeWidth={1.4} />
            </motion.g>

            {/* Fins — swept in from the sides onto their root seams. */}
            <motion.g id="gFinL" style={groupStyle('gFinL')}>
                <path
                    d="M78 136 C62 152 53 170 51 188 C50.6 192.4 54.6 194.6 58.4 192.6 L78 182 Z"
                    fill="url(#ra-fin)"
                    stroke="#e2e8f0"
                    strokeOpacity={0.28}
                    strokeWidth={1}
                />
                <path d="M74 143 C63 157 57 171 55 185" stroke="#0b1220" strokeOpacity={0.22} strokeWidth={1.2} fill="none" />
            </motion.g>
            <motion.g id="gFinR" style={groupStyle('gFinR')}>
                <path
                    d="M142 136 C158 152 167 170 169 188 C169.4 192.4 165.4 194.6 161.6 192.6 L142 182 Z"
                    fill="url(#ra-fin)"
                    stroke="#e2e8f0"
                    strokeOpacity={0.28}
                    strokeWidth={1}
                />
                <path d="M146 143 C157 157 163 171 165 185" stroke="#0b1220" strokeOpacity={0.22} strokeWidth={1.2} fill="none" />
            </motion.g>

            {/* Hull — the first part on the pad; everything else lands onto it. */}
            <motion.g id="gHull" style={groupStyle('gHull')}>
                <path
                    d="M78 58 L78 176 Q78 184 86 184 L134 184 Q142 184 142 176 L142 58 Z"
                    fill="url(#ra-hull)"
                    stroke="#e2e8f0"
                    strokeOpacity={0.45}
                    strokeWidth={1}
                />
                {/* Metal read: one specular column, one shaded edge. */}
                <rect x={85} y={62} width={7} height={116} rx={3.5} fill="#ffffff" fillOpacity={0.3} />
                <rect x={133} y={62} width={6} height={116} rx={3} fill="#0b1220" fillOpacity={0.16} />

                {/* Accent trim stripe */}
                <rect x={78} y={98} width={64} height={3.4} fill="#6366f1" fillOpacity={0.85} />
                <rect x={78} y={101.4} width={64} height={1} fill="#312e81" fillOpacity={0.5} />

                {/* Porthole: glow ring, glass, off-centre catchlight */}
                <circle cx={110} cy={81} r={15.5} fill="url(#ra-porthole-glow)" />
                <circle cx={110} cy={81} r={11.5} fill="#1e2334" />
                <circle cx={110} cy={81} r={10} fill="url(#ra-glass)" />
                <circle
                    cx={110}
                    cy={81}
                    r={11.5}
                    fill="none"
                    stroke="#c7d2fe"
                    strokeOpacity={0.7}
                    strokeWidth={1.6}
                />
                <circle cx={105.6} cy={76.6} r={3.1} fill="#ffffff" fillOpacity={0.72} />

                {/* Three module bays — etched, each with an LED and detail lines */}
                {ROCKET_BAYS.map((bay, i) => {
                    const lit = i < litBays;
                    return (
                        <g key={bay.y}>
                            <rect
                                x={84}
                                y={bay.y - 9}
                                width={52}
                                height={18}
                                rx={5}
                                fill="#0b1220"
                                fillOpacity={0.12}
                                stroke="#0b1220"
                                strokeOpacity={0.24}
                                strokeWidth={1}
                            />
                            <rect
                                x={84}
                                y={bay.y - 9}
                                width={52}
                                height={1}
                                fill="#ffffff"
                                fillOpacity={0.35}
                            />
                            <circle
                                cx={93}
                                cy={bay.y}
                                r={3.2}
                                fill={lit ? BAY_LED_LIT : BAY_LED_DARK}
                                className="transition-[fill] duration-300"
                            />
                            {lit && (
                                <circle cx={93} cy={bay.y} r={6.4} fill={BAY_LED_LIT} fillOpacity={0.22} />
                            )}
                            <rect
                                x={102}
                                y={bay.y - 4}
                                width={28}
                                height={1.4}
                                rx={0.7}
                                fill="#0b1220"
                                fillOpacity={0.3}
                            />
                            <rect
                                x={102}
                                y={bay.y + 2.6}
                                width={18}
                                height={1.4}
                                rx={0.7}
                                fill="#0b1220"
                                fillOpacity={0.22}
                            />
                        </g>
                    );
                })}
            </motion.g>

            {/* Nose cone — accent part, lowered onto the hull seam. */}
            <motion.g id="gNose" style={groupStyle('gNose')}>
                <path
                    d="M110 6 C124 26 142 46 142 61 L78 61 C78 46 96 26 110 6 Z"
                    fill="url(#ra-nose)"
                    stroke="#c7d2fe"
                    strokeOpacity={0.4}
                    strokeWidth={1}
                />
                {/* Specular highlight down the windward face */}
                <path
                    d="M106 15 C98 32 90 47 88 59 L96.5 59 C99 46 103.5 30 108.5 17 Z"
                    fill="#ffffff"
                    fillOpacity={0.42}
                />
                <path d="M78 59.5 L142 59.5" stroke="#312e81" strokeOpacity={0.55} strokeWidth={1.4} />
            </motion.g>

            {/* Layered plume: outer body + white-hot core. Flicker only while lit. */}
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
                    d="M92 208 C92 222 98 233 110 246 C122 233 128 222 128 208 Z"
                    fill="url(#ra-flame)"
                    style={{ transformBox: 'fill-box', transformOrigin: 'center top' }}
                    animate={flicker ? { scaleY: [1, 1.1, 0.94, 1], opacity: [1, 0.86, 1] } : undefined}
                    transition={flicker ? { duration: 0.42, repeat: Infinity, ease: 'easeInOut' } : undefined}
                />
                <motion.path
                    d="M100.5 208 C100.5 218 104 226 110 235 C116 226 119.5 218 119.5 208 Z"
                    fill="url(#ra-flame-core)"
                    style={{
                        transformBox: 'fill-box',
                        transformOrigin: 'center top',
                        opacity: coreOpacity,
                    }}
                    animate={flicker ? { scaleY: [1, 0.88, 1.06, 1] } : undefined}
                    transition={flicker ? { duration: 0.3, repeat: Infinity, ease: 'easeInOut' } : undefined}
                />
            </motion.g>
        </svg>
    );
}
