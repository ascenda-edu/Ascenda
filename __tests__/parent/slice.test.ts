/**
 * The parent feature slice: its boundary, and the pure model behind it.
 *
 * Two halves, deliberately:
 *
 *   1. SOURCE-LEVEL guards on the slice boundary. `npm run lint:boundaries`
 *      already enforces the import direction; what it cannot see is the shape
 *      of `app/parent/` (should be route files only) or whether `index.ts` has
 *      quietly grown a second entry point. Same technique, and same reason, as
 *      __tests__/data/call-sites.test.ts: some invariants are about the files,
 *      not about what the files compute.
 *
 *   2. UNIT tests of `features/parent/model/**` imported DIRECTLY, with no
 *      mocks and no Supabase. That is the whole argument for a pure model
 *      layer, so this file is also the proof it is actually pure — if a model
 *      module ever reaches for next/headers or a client, these imports start
 *      failing in jsdom.
 *
 * Tests import slice INTERNALS (`../model/ics`) rather than the public barrel.
 * That is intentional and legal: dependency-cruiser excludes `__tests__/`, and
 * a test that could only reach the model through `index.ts` would drag
 * `api/context.ts` -> `next/headers` into jsdom for no reason.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { ACTIVE_CHILD_COOKIE } from '@/features/parent/model/active-child';
import {
  DEFAULT_HOME_CURRENCY,
  HOME_CURRENCIES,
  convertFromGbp,
  formatGbp,
  formatHomeOnly,
  formatWithHomeCurrency,
  isHomeCurrencyCode,
} from '@/features/parent/model/currency';
import { buildDeadlinesIcs } from '@/features/parent/model/ics';
import type { ChildDeadline } from '@/features/parent/model/types';

const ROOT = join(__dirname, '..', '..');
const SLICE = join(ROOT, 'src', 'features', 'parent');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
};

const rel = (file: string) => relative(ROOT, file).split(/[\\/]/).join('/');

describe('the parent slice boundary', () => {
  it('leaves app/parent/ holding route files only', () => {
    // The migration's actual claim: routing stayed in app/, everything else
    // moved. `_lib/`, `_components/` and the four route-local `_*.tsx` client
    // components are all gone. A new non-route file here is the slice leaking
    // back out — and because app/parent/** is not covered by
    // feature-internals-are-private, nothing else would catch it.
    const strays = walk(join(ROOT, 'src', 'app', 'parent'))
      .map(rel)
      .filter((f) => !/\/(page|layout|loading|error|template|default|not-found)\.tsx?$/.test(f));

    expect(strays).toEqual([]);
  });

  it('is reached from outside only through index.ts', () => {
    // dependency-cruiser enforces this on src/. This adds __tests__/ and
    // scripts/, which its config excludes, so a deep import cannot sneak in via
    // a test helper and then get "just moved" into src later.
    const offenders: string[] = [];
    for (const dir of ['src', '__tests__', 'scripts']) {
      for (const file of walk(join(ROOT, dir))) {
        const path = rel(file);
        if (path.startsWith('src/features/parent/')) continue;
        if (path.startsWith('__tests__/parent/')) continue; // this file, by design
        if (/@\/features\/parent\//.test(readFileSync(file, 'utf8'))) offenders.push(path);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('exposes exactly one public entry point', () => {
    const barrels = readdirSync(SLICE).filter((e) => /^index\.tsx?$/.test(e));
    expect(barrels).toEqual(['index.ts']);
  });

  it('keeps the deliberately-private model helpers out of index.ts', () => {
    // These have no caller outside the slice. The barrel is the surface under
    // review, so widening it should be an explicit edit, not a side effect.
    const barrel = read('src/features/parent/index.ts');
    for (const symbol of [
      'buildDeadlinesIcs',
      'convertFromGbp',
      'formatWithHomeCurrency',
      'formatHomeOnly',
      'isHomeCurrencyCode',
      'HOME_CURRENCIES',
      'HOME_CURRENCY_STORAGE_KEY',
    ]) {
      expect({ symbol, exported: new RegExp(`^\\s*${symbol},?$`, 'm').test(barrel) })
        .toEqual({ symbol, exported: false });
    }
  });
});

describe('features/parent/model is pure', () => {
  it('imports no framework, client or api module', () => {
    for (const file of walk(join(SLICE, 'model'))) {
      const source = readFileSync(file, 'utf8');
      expect({ file: rel(file), matches: /from '(react|react-dom|next\/|@supabase\/|\.\.\/(api|ui)\/)/.test(source) })
        .toEqual({ file: rel(file), matches: false });
    }
  });

  it('names the active-child cookie', () => {
    // Read by a server route handler AND a client component — the concrete
    // reason model/ has to stay importable from both sides.
    expect(ACTIVE_CHILD_COOKIE).toBe('ascenda-parent-child');
  });
});

describe('model/currency', () => {
  it('renders GBP without a conversion', () => {
    expect(formatGbp(24500)).toBe('£24,500');
    expect(formatWithHomeCurrency(24500, 'GBP')).toBe('£24,500');
    expect(formatHomeOnly(24500, 'GBP')).toBe('£24,500');
  });

  it('appends the home-currency approximation for everything else', () => {
    // Asserted structurally, not glyph-for-glyph: both formatters are `en-GB`,
    // which renders USD as "US$31,115" (not "$31,115" as the module's own
    // comment says), and the exact currency symbol is ICU-data dependent.
    // Pinning the shape survives a Node upgrade; pinning the string would not.
    const formatted = formatWithHomeCurrency(24500, 'USD');
    expect(formatted).toMatch(/^£24,500 \(≈ \D*31,115\)$/);
  });

  it('converts at the snapshot rate', () => {
    expect(convertFromGbp(100, 'GBP')).toBe(100);
    expect(convertFromGbp(100, 'EUR')).toBeCloseTo(117, 6);
  });

  it('falls back to GBP for an unknown code', () => {
    expect(convertFromGbp(100, 'ZZZ' as never)).toBe(100);
  });

  it('guards a persisted preference', () => {
    expect(isHomeCurrencyCode(DEFAULT_HOME_CURRENCY)).toBe(true);
    expect(isHomeCurrencyCode('ZZZ')).toBe(false);
    expect(isHomeCurrencyCode(null)).toBe(false);
    expect(HOME_CURRENCIES.some((c) => c.code === DEFAULT_HOME_CURRENCY)).toBe(true);
  });
});

describe('model/ics', () => {
  const deadline = (over: Partial<ChildDeadline> = {}): ChildDeadline => ({
    id: 'app-1',
    university: 'Oxford',
    program: 'Computer Science',
    name: 'UCAS deadline',
    date: '2026-10-15',
    intake: 'Autumn 2027',
    daysUntil: 30,
    ...over,
  });

  it('emits all-day events, never timed ones', () => {
    // A timed event would shift by the importing calendar's UTC offset — the
    // same date-only trap lib/utils/dates.ts exists for.
    const ics = buildDeadlinesIcs([deadline()], 'Amara');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261015');
    expect(ics).toContain('DTEND;VALUE=DATE:20261016'); // DTEND is exclusive
    expect(ics).not.toMatch(/DTSTART:\d{8}T/);
  });

  it('escapes the RFC 5545 special characters', () => {
    const ics = buildDeadlinesIcs([deadline({ name: 'Early; action, round' })], 'Amara');
    expect(ics).toContain('SUMMARY:Oxford — Early\\; action\\, round');
  });

  it('drops a malformed date rather than emitting a broken event', () => {
    const ics = buildDeadlinesIcs([deadline({ date: 'soon' })], 'Amara');
    expect(ics).not.toContain('BEGIN:VEVENT');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('folds long lines on a code point, never mid-surrogate', () => {
    const ics = buildDeadlinesIcs([deadline({ university: `${'🎓'.repeat(60)}` })], 'Amara');
    expect(ics).not.toContain('�');
    for (const line of ics.split('\r\n')) expect(Array.from(line).length).toBeLessThanOrEqual(76);
  });
});
