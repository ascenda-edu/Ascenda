/**
 * Source-level guards on the migrated call sites.
 *
 * Unit tests prove the data layer behaves. They cannot prove a page USES it —
 * and every bug this work removes was a call site quietly doing its own thing:
 * its own column list, its own row interface, its own (missing) error handling.
 * So these tests read the source.
 *
 * They are deliberately narrow. They assert facts about the files migrated in
 * this pass, plus one repo-wide subset check whose allowlist shrinks as the
 * remaining call sites move over.
 *
 * HOW THIS FILE IS WRITTEN, AND WHY
 * ---------------------------------
 * Three of these checks used to be `for (const match of source.matchAll(…))
 * expect(…)` — assertions INSIDE a loop over regex matches. For most of the
 * files the regex matched zero times, so the loop body never ran and the case
 * reported a green tick having executed no assertion at all: six passing cases,
 * two assertions actually run. A Jest case whose loop body never runs is
 * indistinguishable from one that checked something.
 *
 * So every check below is now written as a **detector** — a pure function from
 * source text to a list of offenders — applied to the real files with
 * `expect(offenders).toEqual([])`, which is honest about zero matches meaning
 * "nothing offended". And because a detector that has quietly stopped matching
 * anything is exactly as useless as an empty loop, each one is ALSO run against
 * a synthetic known-bad source in `describe('the detectors detect')` below.
 * That is the part that fails if a regex rots.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

/**
 * Comments are stripped before every scan below. Several of these files now
 * QUOTE the old broken code in a comment explaining why it was replaced — which
 * is exactly the documentation that should exist, and would otherwise trip the
 * very tests guarding against it coming back.
 */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const read = (path: string) => stripComments(readFileSync(join(ROOT, path), 'utf8'));

const walk = (dir: string, out: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
};

/* ── the detectors ───────────────────────────────────────────────────────── */

/** Every `.from('applications')` in the file, however its select is written. */
const applicationQueries = (source: string): string[] =>
  [...source.matchAll(/\.from\(\s*['"]applications['"]\s*\)/g)].map((match) => match[0]);

/**
 * Applications queries whose select is a literal rather than one of the shared
 * constants. `parent/api/data.ts` keeps ONE applications read (the no-embed
 * cost-lines shape) and sends `APPLICATION_SUMMARY_SELECT`.
 */
const literalApplicationSelects = (source: string): string[] =>
  [...source.matchAll(/\.from\(\s*['"]applications['"]\s*\)[\s\S]{0,120}?\.select\(([^)]*)/g)]
    .map((match) => match[1].trim())
    .filter((select) => !/APPLICATION_[A-Z_]+_SELECT/.test(select));

/**
 * Awaited Supabase calls that destructure `data` but not `error`.
 *
 * `auth.getUser()` returns `{ data: { user } }` and its failure mode is a null
 * user, which the pages already redirect on — so it is excluded by name.
 */
const unboundSupabaseErrors = (source: string): string[] =>
  [...source.matchAll(/const\s*\{([\s\S]{0,300}?)\}\s*=\s*await\s+([\s\S]{0,300}?);/g)]
    .filter(([, , expression]) => expression.includes('supabase') && !expression.includes('.auth.'))
    .filter(([, bindings]) => !bindings.includes('error'))
    .map(([, bindings]) => bindings.trim());

/**
 * Imports are stripped before scanning for DECLARATIONS: `import { type
 * ApplicationBoardRow } from '@/lib/data/columns'` is the migration working,
 * and it is textually indistinguishable from a declaration without this.
 */
const stripImports = (source: string) =>
  source.replace(/\bimport\s[\s\S]*?from\s*['"][^'"]+['"];?/g, '');

/**
 * The drift family: the local row shapes that diverged, plus any SUFFIXED
 * variant of them.
 *
 * The old check listed `ApplicationRecord|AppRecord|ApplicationJoin|…` as exact
 * identifiers, so `type AppRow2 = {…}` reintroduced the exact drift and passed.
 * Anchoring the suffix instead closes that without swallowing legitimate local
 * view models such as `AppWidgetRow` (a chat rendering shape, not a table row).
 */
const DRIFT_FAMILY = /^(?:Application|App|Checklist|Deadline|Document)(?:Record|Row|Join)\w*$/;

/** Locally re-declared application row shapes. */
const localApplicationRowTypes = (source: string): string[] =>
  [...stripImports(source).matchAll(/\b(?:type|interface)\s+(\w+)\s*(?:=|\{|<)/g)]
    .map((match) => match[1])
    .filter((name) => DRIFT_FAMILY.test(name));

/* ── the files ───────────────────────────────────────────────────────────── */

/**
 * The files migrated onto the shared data layer in this pass, with how many
 * `.from('applications')` queries each is permitted to keep.
 *
 * The number is asserted, not just "no literal selects": a page that grows a
 * brand-new hand-rolled applications query is the regression, and a check that
 * only inspects the selects of queries that exist cannot see one appear.
 */
const MIGRATED: Array<[path: string, ownApplicationQueries: number]> = [
  ['src/app/applications/page.tsx', 0],
  ['src/app/applications/tasks/page.tsx', 0],
  ['src/app/applications/documents/page.tsx', 0],
  // The no-embed cost-lines shape, sending APPLICATION_SUMMARY_SELECT.
  ['src/features/parent/api/data.ts', 1]
];

const MIGRATED_PATHS = MIGRATED.map(([path]) => path);

describe('the migrated call sites go through the data layer', () => {
  it.each(MIGRATED_PATHS)('%s imports the loaders', (path) => {
    expect(read(path)).toMatch(/from '@\/lib\/data\/(applications|columns|errors)'/);
  });

  it.each(MIGRATED)('%s keeps exactly %i applications queries of its own', (path, expected) => {
    expect(applicationQueries(read(path))).toHaveLength(expected);
  });

  it.each(MIGRATED_PATHS)('%s sends no literal applications select', (path) => {
    expect(literalApplicationSelects(read(path))).toEqual([]);
  });

  it.each(MIGRATED_PATHS)('%s hand-writes no application row interface', (path) => {
    expect(localApplicationRowTypes(read(path))).toEqual([]);
  });

  it.each(MIGRATED_PATHS)('%s binds every Supabase error it receives', (path) => {
    expect(unboundSupabaseErrors(read(path))).toEqual([]);
  });

  it('applications/page.tsx no longer discards the board query error', () => {
    const source = read('src/app/applications/page.tsx');
    // The exact regression: `const { data: applications } = await supabase…`,
    // whose null-on-failure fell through to the "No applications yet" state.
    expect(source).not.toMatch(/const\s*\{\s*data:\s*applications\s*\}/);
    expect(source).toContain('loadApplicationBoard');
  });
});

describe('the nested applications embed exists in one place', () => {
  /**
   * Files still writing `program:programs(…)` by hand. This list may only
   * SHRINK.
   *
   * It is now down to the module that OWNS the string. The three chat entries
   * (`lib/chat/context.ts`, `lib/chat/tools/student-read.ts`,
   * `lib/chat/tools/student-write.ts`) came off it when those files moved onto
   * `loadApplicationBoard` / `loadApplicationLabel`.
   */
  const ALLOWED = new Set([
    'src/lib/data/columns.ts', // the owner
  ]);

  it('is not re-hand-written anywhere new', () => {
    const offenders = walk(SRC)
      .filter((file) => stripComments(readFileSync(file, 'utf8')).includes('program:programs('))
      .map((file) => relative(ROOT, file).split(/[\\/]/).join('/'));

    // The allowlist must still be earning its place — an entry that no longer
    // matches anything means the check has drifted off its target.
    expect(offenders).toEqual([...ALLOWED]);
    expect(offenders.filter((file) => !ALLOWED.has(file))).toEqual([]);
  });

  it('is gone from every page under /applications', () => {
    const offenders = walk(join(SRC, 'app', 'applications'))
      .filter((file) => stripComments(readFileSync(file, 'utf8')).includes('programs('))
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });
});

describe('the copied unwrap helpers', () => {
  /** All three copies of the identical helper the audit counted. */
  const COPIES = [
    'src/features/parent/api/data.ts',
    'src/lib/counsellor/data.ts',
    'src/lib/counsellor/decks.ts',
  ];

  it.each(COPIES)('%s uses the shared one instead of its own', (path) => {
    const source = read(path);
    expect(source).toContain("import { unwrap } from '@/lib/data/errors'");
    expect(source).not.toMatch(/const\s+unwrap\s*=/);
  });

  it('nothing under src/lib defines a local unwrap any more', () => {
    const offenders = walk(join(SRC, 'lib'))
      .filter((file) => /const\s+unwrap\s*=/.test(stripComments(readFileSync(file, 'utf8'))))
      .map((file) => relative(ROOT, file).split(/[\\/]/).join('/'));

    // errors.ts declares `export function unwrap`, not `const unwrap =`.
    expect(offenders).toEqual([]);
  });
});

describe('the assistant reads applications through the data layer', () => {
  const CHAT = [
    'src/lib/chat/context.ts',
    'src/lib/chat/tools/student-read.ts',
    'src/lib/chat/tools/student-write.ts',
  ];

  it.each(CHAT)('%s imports a loader rather than building the query', (path) => {
    expect(read(path)).toMatch(/from '@\/lib\/data\/(applications|columns|errors)'/);
  });

  it.each(CHAT)('%s builds no applications query of its own', (path) => {
    // Zero, asserted as a count — these three came off the hand-written list
    // entirely when they moved onto loadApplicationBoard/loadApplicationLabel.
    expect(applicationQueries(read(path))).toHaveLength(0);
  });

  it.each(CHAT)('%s hand-writes no application row interface', (path) => {
    expect(localApplicationRowTypes(read(path))).toEqual([]);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
 * The detectors are themselves under test.
 *
 * Everything above asserts "no offenders found". That is only worth anything
 * while the detectors can still FIND an offender — a regex that has rotted
 * reports a clean bill of health for a broken file, which is precisely the
 * failure mode that made the previous version of this file vacuous.
 * ═══════════════════════════════════════════════════════════════════════════ */

describe('the detectors detect', () => {
  it('a hand-rolled applications query is counted', () => {
    expect(
      applicationQueries(`const { data } = await supabase.from('applications').select('id,status');`)
    ).toHaveLength(1);
    // …in either quote style, and with whitespace inside the call.
    expect(applicationQueries(`supabase.from( "applications" ).select('*')`)).toHaveLength(1);
    expect(applicationQueries(`supabase.from('documents').select('*')`)).toEqual([]);
  });

  it('a literal select on an applications query is flagged', () => {
    expect(
      literalApplicationSelects(
        `await supabase.from('applications').select('id,status,program:programs(course_name)');`
      )
    ).toEqual([`'id,status,program:programs(course_name`]);
  });

  it('a shared-constant select on an applications query is not', () => {
    expect(
      literalApplicationSelects(`await supabase.from('applications').select(APPLICATION_BOARD_SELECT);`)
    ).toEqual([]);
  });

  it('a literal select survives an intervening filter chain', () => {
    // The old pattern allowed 80 characters between `.from` and `.select`; a
    // `.eq()` or two in between is enough to slip past a window that is too tight.
    expect(
      literalApplicationSelects(
        `await supabase.from('applications').eq('profile_id', id).order('created_at').select('id,status');`
      )
    ).toEqual([`'id,status'`]);
  });

  it('a discarded Supabase error is flagged', () => {
    expect(
      unboundSupabaseErrors(`const { data: applications } = await supabase.from('applications').select('*');`)
    ).toEqual(['data: applications']);
  });

  it('a bound Supabase error is not', () => {
    expect(
      unboundSupabaseErrors(`const { data, error } = await supabase.from('applications').select('*');`)
    ).toEqual([]);
  });

  it('auth.getUser is exempt, because its failure mode is a null user', () => {
    expect(
      unboundSupabaseErrors(`const { data: { user } } = await supabase.auth.getUser();`)
    ).toEqual([]);
  });

  it.each([
    'type ApplicationRecord = { id: string };',
    'type AppRecord = { id: string };',
    'interface ApplicationJoin { id: string }',
    'type ChecklistJoin = { id: string };',
    'type DeadlineRecord = { id: string };',
    'type DocumentJoin = { id: string };',
    // The one that used to slip through: the old check was keyed to a fixed
    // list of identifiers, so a suffix defeated it.
    'type AppRow2 = { id: string };'
  ])('a local row type is flagged: %s', (source) => {
    expect(localApplicationRowTypes(source)).toHaveLength(1);
  });

  it.each([
    ['an unrelated local type', 'type BoardColumnProps = { title: string };'],
    // A chat/UI view model that merely reads like a row. Flagging it would make
    // the check unusable and someone would delete it.
    ['a local view model', 'type AppWidgetRow = { id: string; course: string };'],
    // The migration working: the shared shapes come in by import.
    ['an imported shared shape', "import { type ApplicationBoardRow } from '@/lib/data/columns';"]
  ])('%s is left alone', (_label, source) => {
    expect(localApplicationRowTypes(source)).toEqual([]);
  });

  it('the comment stripper does not blind the detectors to real code', () => {
    // The stripper exists so a comment QUOTING the old broken code does not trip
    // these checks. If it ever ate real code instead, every check above would go
    // permanently, silently green.
    const source = stripComments(`
      // await supabase.from('applications').select('id,status');
      /* type ApplicationRecord = { id: string }; */
      const { data, error } = await supabase.from('applications').select(APPLICATION_BOARD_SELECT);
    `);

    expect(applicationQueries(source)).toHaveLength(1);
    expect(literalApplicationSelects(source)).toEqual([]);
    expect(localApplicationRowTypes(source)).toEqual([]);
    expect(unboundSupabaseErrors(source)).toEqual([]);
  });
});
