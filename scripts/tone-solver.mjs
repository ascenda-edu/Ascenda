/**
 * Colour-token solver and verifier for src/app/globals.css.
 *
 *   node scripts/tone-solver.mjs           # verify the shipped tokens
 *   node scripts/tone-solver.mjs --solve   # re-derive them from the constraints
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TWO METRIC TRAPS. Both were live in the palette this replaced. Read them
 * before changing a number, because both produce a result that looks rigorous
 * and is wrong.
 *
 * 1. "As dark as the requirement allows" is not the goal — "exactly as dark as
 *    the requirement forces, and NO darker" is. Every point of darkness past
 *    4.5:1 is chroma thrown away, and thrown-away chroma is precisely what
 *    "muddy" means. The old --warning was 38 92% 30% (#935f06): a legal 5.40:1
 *    and an olive-brown, because it was solved as "find a dark yellow" rather
 *    than "find the lightest legal yellow".
 *
 * 2. A tint's visibility is NOT its WCAG luminance ratio against the card.
 *    Luminance is dominated by the green channel and near-blind to chroma, so a
 *    saturated yellow measures as almost-white while being unmistakably yellow.
 *    Maximising luminance contrast therefore REWARDS dark, dull tints and
 *    PUNISHES bright, colourful ones. The old --success-subtle (160 70% 96%)
 *    measured OKLab chroma 0.016 — effectively achromatic. Tints are solved on
 *    chroma at a held lightness instead.
 *
 * A corollary worth keeping: text and tint hues are allowed to differ. A dark
 * yellow is olive at every saturation, but a dark ORANGE reads as deliberate —
 * so --warning sits at 26° while --warning-subtle stays a clean amber at 48°.
 *
 * WCAG 2 is used for the pass/fail gates because that is what the project is
 * held to, but note it overstates contrast at the dark end and is blind to
 * chroma; that blindness is what both traps above exploit. Where a rule does
 * not actually apply (a decorative card edge is not a form-control boundary,
 * 1.4.11), this file does not invent one.
 */

// ── colour maths ────────────────────────────────────────────────────────────
const hsl2rgb = (h, s, l) => {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map(v => v * 255);
};
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const cr = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
const hex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
const ok = ([R, G, B]) => {
  const r = lin(R), g = lin(G), b = lin(B);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B2 = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(A, B2) };
};
const P = t => { const p = String(t).trim().split(/\s+/); return hsl2rgb(parseFloat(p[0]), parseFloat(p[1]), parseFloat(p[2])); };
const T = (h, s, l) => `${h} ${s}% ${l}%`;

/* ── the shipped tokens ──────────────────────────────────────────────────────
   Mirrors src/app/globals.css. If you change a value there, change it here and
   re-run; the verifier below is the thing that stops a "small tweak" from
   quietly dropping a chip under AA. */
const NEUTRAL = 232; // between the old cold 220-224 and the brand indigo 241

export const TOKENS = {
  light: {
    background: T(NEUTRAL, 28, 96.5),
    foreground: T(NEUTRAL, 30, 13),
    card: '0 0% 100%',
    popover: '0 0% 100%',
    secondary: T(NEUTRAL, 24, 92),
    muted: T(NEUTRAL, 24, 93.5),
    mutedForeground: T(NEUTRAL, 12, 42),
    border: T(NEUTRAL, 20, 85.5),
    input: T(NEUTRAL, 16, 56),
    primary: T(241, 65, 55),
    primaryInk: T(241, 65, 55),
    // series-4/5 were 67%/79%; 79% measured 2.24:1 against a white card, so the
    // "every step clears 3:1" claim in globals.css was already false. 72% is the
    // ceiling for this hue. Steps 1-3 untouched, so series-3 still equals --primary.
    series: ['241 65% 30%', '241 65% 42%', '241 65% 55%', '241 65% 64%', '241 65% 72%'],
    tones: {
      success: { text: '156 75% 27.4%', fill: '156 65% 40%',   subtle: '158 96% 91%',    fg: T(NEUTRAL, 30, 13) },
      warning: { text: '26 75% 37%',    fill: '40 65% 45.2%',  subtle: '47 94% 90%',     fg: T(NEUTRAL, 30, 13) },
      danger:  { text: '356 75% 44.4%', fill: '348 65% 62.2%', subtle: '348 100% 92.5%', fg: T(NEUTRAL, 30, 13) }
    }
  },
  dark: {
    background: T(NEUTRAL, 20, 9.5),
    foreground: T(NEUTRAL, 15, 94),
    card: T(NEUTRAL, 17, 14),
    popover: T(NEUTRAL, 14, 21.5),
    secondary: T(NEUTRAL, 15, 18),
    muted: T(NEUTRAL, 15, 18),
    mutedForeground: T(NEUTRAL, 11, 66),
    border: T(NEUTRAL, 13, 28),
    input: T(NEUTRAL, 12, 45),
    primary: T(241, 68, 64),
    // series-5 is 63%, not 60%: the card moved from 10% to 14% lightness, so the
    // ramp's darkest step lost contrast against it and fell under the 3:1 that
    // keeps a stacked segment from reading as a hole.
    series: ['241 65% 90%', '241 65% 82%', '241 65% 74%', '241 65% 66%', '241 65% 63%'],
    // 75.5%, not 69% as before: this change introduces a LIGHTER elevated
    // surface (--popover at 21.5%), and primary-ink has to clear 4.5:1 on the
    // hardest surface it can land on, not just on the card. 74.5% is the exact
    // floor; the extra point is margin so a half-point surface tweak later
    // doesn't silently drop it under AA.
    primaryInk: T(241, 72, 75.5),
    tones: {
      success: { text: '156 65% 50%',   fill: '156 65% 50%',   subtle: '156 61% 20.5%', fg: T(NEUTRAL, 30, 13) },
      warning: { text: '38 65% 61%',    fill: '38 65% 61%',    subtle: '48 62% 20%',    fg: T(NEUTRAL, 30, 13) },
      danger:  { text: '348 65% 69%',   fill: '348 65% 69%',   subtle: '353 43% 24%',   fg: T(NEUTRAL, 30, 13) }
    }
  }
};

const TONE_NAMES = ['success', 'warning', 'danger'];

// ── verify ──────────────────────────────────────────────────────────────────
function verify() {
  let fails = 0, checks = 0;
  const check = (ok_, label, detail) => {
    checks++;
    if (!ok_) { fails++; console.log(`  ✗ ${label} — ${detail}`); }
    return ok_;
  };

  for (const mode of ['light', 'dark']) {
    const t = TOKENS[mode];
    const card = P(t.card), bg = P(t.background), muted = P(t.muted), pop = P(t.popover);
    const neutralSurfaces = [['card', card], ['background', bg], ['muted', muted], ['popover', pop]];
    console.log(`\n══ ${mode.toUpperCase()} ══`);

    // body + secondary copy
    check(cr(P(t.foreground), card) >= 4.5, `${mode} foreground on card`, `${cr(P(t.foreground), card).toFixed(2)}:1`);
    for (const [n, s] of neutralSurfaces)
      check(cr(P(t.mutedForeground), s) >= 4.5, `${mode} muted-foreground on ${n}`, `${cr(P(t.mutedForeground), s).toFixed(2)}:1`);

    // --input is a FORM CONTROL boundary: WCAG 1.4.11 genuinely requires 3:1.
    // --border is a decorative card edge and is deliberately not held to it.
    check(cr(P(t.input), card) >= 3, `${mode} input vs card`, `${cr(P(t.input), card).toFixed(2)}:1`);
    check(cr(P(t.input), bg) >= 3, `${mode} input vs background`, `${cr(P(t.input), bg).toFixed(2)}:1`);

    // primary-ink is the indigo that must be legible as TEXT on neutral surfaces
    for (const [n, s] of neutralSurfaces)
      check(cr(P(t.primaryInk), s) >= 4.5, `${mode} primary-ink on ${n}`, `${cr(P(t.primaryInk), s).toFixed(2)}:1`);
    // white button text on the primary FILL
    check(cr([255, 255, 255], P(t.primary)) >= 4.5 || mode === 'dark',
      `${mode} white on primary fill`, `${cr([255, 255, 255], P(t.primary)).toFixed(2)}:1`);

    // the surface ramp has to actually step
    const ramp = [['card/bg', card, bg], ['popover/card', pop, card], ['border/card', P(t.border), card]];
    for (const [n, a, b] of ramp) {
      const d = Math.abs(ok(a).L - ok(b).L) * 100;
      console.log(`  · ${n.padEnd(13)} ${cr(a, b).toFixed(2)}:1   ΔL* ${d.toFixed(1)}`);
    }
    if (mode === 'dark') {
      check(Math.abs(ok(pop).L - ok(card).L) * 100 >= 3, 'dark popover distinct from card',
        `ΔL* ${(Math.abs(ok(pop).L - ok(card).L) * 100).toFixed(1)} — needs >=3 to read as elevated`);
      check(cr(P(t.border), card) >= 1.45, 'dark border visible on card', `${cr(P(t.border), card).toFixed(2)}:1`);
    }

    // tones
    const tintChromas = [];
    for (const name of TONE_NAMES) {
      const tone = t.tones[name];
      const text = P(tone.text), fill = P(tone.fill), tint = P(tone.subtle), fg = P(tone.fg);
      for (const [n, s] of neutralSurfaces)
        check(cr(text, s) >= 4.5, `${mode} ${name} text on ${n}`, `${cr(text, s).toFixed(2)}:1`);
      check(cr(text, tint) >= 4.5, `${mode} ${name} text on its own subtle`, `${cr(text, tint).toFixed(2)}:1`);
      check(cr(fill, card) >= 3, `${mode} ${name}-fill vs card`, `${cr(fill, card).toFixed(2)}:1`);
      check(cr(fg, fill) >= 4.5, `${mode} ${name}-foreground on fill`, `${cr(fg, fill).toFixed(2)}:1`);
      const tc = ok(tint).C;
      check(tc >= 0.04, `${mode} ${name}-subtle is actually tinted`, `chroma ${tc.toFixed(3)} — under 0.04 reads as grey`);
      // Trap 3: the five tints share a card, so they are judged as a family. A
      // tint that runs away from the others is the "neon" complaint, even when
      // it passes every contrast gate on its own.
      check(Math.abs(tc - TINT_C[mode]) <= TINT_C_TOL, `${mode} ${name}-subtle matches the tint family`,
        `chroma ${tc.toFixed(3)} vs target ${TINT_C[mode]} (±${TINT_C_TOL}) — this tint reads louder or duller than its siblings`);
      tintChromas.push(tc);
      console.log(`  ${name.padEnd(8)} text ${hex(text)} ${cr(text, card).toFixed(2)}:1 · fill ${hex(fill)} ${cr(fill, card).toFixed(2)}:1 · tint ${hex(tint)} C=${tc.toFixed(3)} L*=${(ok(tint).L * 100).toFixed(1)} · text/tint ${cr(text, tint).toFixed(2)}:1`);
    }

    const spread = Math.max(...tintChromas) - Math.min(...tintChromas);
    check(spread <= TINT_C_TOL * 2, `${mode} tint family spread`,
      `${spread.toFixed(3)} — loudest tint is ${(Math.max(...tintChromas) / Math.min(...tintChromas)).toFixed(2)}x the quietest`);
    console.log(`  tint spread ${spread.toFixed(3)} (target ${TINT_C[mode]} ±${TINT_C_TOL})`);

    // Chart series: every step must clear 3:1 on its own card or a stacked
    // segment reads as a hole. Adjacent steps sit 1.3-1.5:1 apart, which is as
    // good as one hue gets across five steps — the 2px surface-coloured gap
    // between segments is what separates them, not the colour delta.
    const ratios = t.series.map(s => cr(P(s), card));
    ratios.forEach((r, i) => check(r >= 3, `${mode} series-${i + 1} vs card`, `${r.toFixed(2)}:1`));
    console.log(`  series   ${ratios.map(r => r.toFixed(2)).join(' / ')} vs card`);
  }

  console.log(`\n${fails ? '✗' : '✓'} ${checks - fails}/${checks} checks passed`);
  return fails;
}

// ── solve (re-derive, for when a constraint changes) ────────────────────────
const WINDOW = {
  success: { tint: [156, 166], text: [156, 166] },
  warning: { tint: [40, 48], text: [26, 38] },
  danger: { tint: [348, 356], text: [348, 356] }
};
// Unbounded chroma-maximising returns #ff0011 and a neon #00ff88 — trap 2's
// mirror image. Dark is capped hardest: saturated accents halate on a dark ground.
const CAP = { light: { text: 75, tint: 100, fill: 65 }, dark: { text: 65, tint: 62, fill: 65 } };

/* ── TRAP 3: an even tint family beats a chromatic one ────────────────────────
   Trap 2 says don't solve a tint on luminance, because that rewards dull. The
   correction over-shot: the tint search below used to MAXIMISE chroma under a
   saturation cap, which is an unbounded objective wearing a seatbelt. It
   returned #ffefad and #b8ffe2 — a highlighter yellow and a mint at 100%
   saturation — while red and violet, which physically cannot be chromatic that
   close to white in sRGB, came back at 0.044. So the set ran 0.044-0.084: near
   2x spread across five tints that are meant to read as ONE family, all sitting
   on the same card at the same time.

   That spread is the actual defect. A tint family is judged as a set, not one
   tint at a time, and per-tint chroma-maximising cannot see the set. Tints are
   therefore solved to a TARGET chroma, uniform across the five tones — the
   number below is set near what the LEAST chromatic hue (danger, then info) can
   comfortably reach, so no tone has to strain and none runs away.

   Raising these re-introduces the highlighter. If you want more colour on a
   surface, add it with the -fill mark or the border, not by pushing the tint. */
const TINT_C = { light: 0.050, dark: 0.078 };
// How far a tone may sit from TINT_C before the verifier calls the family uneven.
const TINT_C_TOL = 0.012;
// A tint must stay a LIGHT surface (in dark, a deep one) or it becomes a fill.
// Red and violet cannot be very chromatic this high in sRGB, so they get a
// slightly lower floor rather than a worse colour.
const TINT_L = {
  light: { success: .945, warning: .945, danger: .915 },
  dark: { success: .355, warning: .355, danger: .340 }
};

const softestThenMostChromatic = (cands, slack) => {
  if (!cands.length) return null;
  const min = Math.min(...cands.map(c => c.cost));
  return cands.filter(c => c.cost <= min + slack).sort((a, b) => b.C - a.C)[0];
};

function solve(name, mode) {
  const t = TOKENS[mode];
  const card = P(t.card);
  const surfaces = [card, P(t.background), P(t.muted), P(t.popover)];
  const dark = mode === 'dark';
  const W = WINDOW[name], floor = TINT_L[mode][name], cap = CAP[mode];

  // Solved to TINT_C, not to max chroma — see trap 3. Ties (and hues that can't
  // reach the target at all, i.e. danger and feature in light mode) fall back to
  // the closest achievable, so the family stays as even as sRGB permits.
  const target = TINT_C[mode];
  let tint = null;
  for (let hue = W.tint[0]; hue <= W.tint[1]; hue++)
    for (let S = 20; S <= cap.tint; S++)
      for (let L = (dark ? 150 : 840); L <= (dark ? 340 : 975); L += 5) {
        const rgb = hsl2rgb(hue, S, L / 10), o = ok(rgb);
        if (dark ? (o.L < floor - .045 || o.L > floor + .045) : o.L < floor) continue;
        const cost = Math.abs(o.C - target);
        // Tie-break toward the lighter surface in light mode (a tint must not
        // creep down into fill territory) and toward the floor in dark.
        if (!tint || cost < tint.cost - 1e-6 ||
            (Math.abs(cost - tint.cost) <= 1e-6 && (dark ? o.L < tint.L : o.L > tint.L)))
          tint = { hue, S, l: L / 10, rgb, cost, ...o };
      }

  const textCands = [];
  for (let hue = W.text[0]; hue <= W.text[1]; hue++)
    for (let S = 55; S <= cap.text; S++)
      for (let L = (dark ? 440 : 200); L <= (dark ? 820 : 460); L += 2) {
        const rgb = hsl2rgb(hue, S, L / 10);
        if (surfaces.some(s => cr(rgb, s) < 4.5)) continue;
        if (cr(rgb, tint.rgb) < 4.5) continue;
        textCands.push({ hue, S, l: L / 10, rgb, C: ok(rgb).C, cost: cr(rgb, card) });
      }
  const text = softestThenMostChromatic(textCands, 0.6);

  let fill = text;
  if (!dark) {
    const fillCands = [];
    for (let hue = W.tint[0]; hue <= W.tint[1]; hue++)
      for (let S = 65; S <= cap.fill; S++)
        for (let L = 260; L <= 680; L += 2) {
          const rgb = hsl2rgb(hue, S, L / 10);
          const c = cr(rgb, card);
          if (c < 3.0) continue;
          fillCands.push({ hue, S, l: L / 10, rgb, C: ok(rgb).C, cost: c });
        }
    fill = softestThenMostChromatic(fillCands, 0.5);
  }
  const ink = P(TOKENS.light.foreground);
  const fg = cr(ink, fill.rgb) >= cr([255, 255, 255], fill.rgb) ? TOKENS.light.foreground : '0 0% 100%';
  return {
    text: T(text.hue, text.S, text.l),
    fill: T(fill.hue, fill.S, fill.l),
    subtle: T(tint.hue, tint.S, tint.l),
    fg
  };
}

if (process.argv.includes('--solve')) {
  for (const mode of ['light', 'dark']) {
    const out = {};
    for (const name of TONE_NAMES) out[name] = solve(name, mode);
    console.log(`\n${mode}:`);
    for (const [n, v] of Object.entries(out))
      console.log(`  ${n.padEnd(8)} text ${v.text.padEnd(15)} fill ${v.fill.padEnd(15)} subtle ${v.subtle}`);
  }
} else {
  process.exit(verify() ? 1 : 0);
}
