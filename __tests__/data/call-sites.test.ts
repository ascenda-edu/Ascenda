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

/** The files migrated onto the shared data layer in this pass. */
const MIGRATED = [
  'src/app/applications/page.tsx',
  'src/app/applications/tasks/page.tsx',
  'src/app/applications/documents/page.tsx',
  'src/lib/parent/data.ts',
];

describe('the migrated call sites go through the data layer', () => {
  it.each(MIGRATED)('%s imports the loaders', (path) => {
    expect(read(path)).toMatch(/from '@\/lib\/data\/(applications|columns|errors)'/);
  });

  it.each(MIGRATED)('%s builds no applications query of its own', (path) => {
    const source = read(path);
    // `parent/data.ts` keeps ONE applications read (the no-embed cost-lines
    // shape), and it sends APPLICATION_SUMMARY_SELECT rather than a literal.
    for (const match of source.matchAll(/\.from\('applications'\)[\s\S]{0,80}?\.select\(([^)]*)/g)) {
      expect(match[1]).toMatch(/APPLICATION_[A-Z_]+_SELECT/);
    }
  });

  it.each(MIGRATED)('%s hand-writes no application row interface', (path) => {
    const source = read(path);
    // The four local `ApplicationRecord` / `AppRecord` / `ApplicationJoin`
    // declarations are what drifted. Row shapes now come from columns.ts.
    expect(source).not.toMatch(/type\s+(ApplicationRecord|AppRecord|ApplicationJoin|ChecklistJoin|DeadlineRecord|ChecklistRecord|DocumentJoin)\s*=/);
  });

  it.each(MIGRATED)('%s binds every Supabase error it receives', (path) => {
    const source = read(path);
    const destructures = source.matchAll(/const\s*\{([\s\S]{0,300}?)\}\s*=\s*await\s+([\s\S]{0,300}?);/g);

    for (const [, bindings, expression] of destructures) {
      // `auth.getUser()` returns `{ data: { user } }`; its failure mode is a
      // null user, which the pages already redirect on.
      if (!expression.includes('supabase') || expression.includes('.auth.')) continue;
      expect({ path, expression, bindings }).toMatchObject({ bindings: expect.stringContaining('error') });
    }
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
   * SHRINK. Each entry is a call site that has not moved onto
   * `src/lib/data/columns.ts` yet — they are owned by other modules in this
   * phase (the chat context and the assistant's read/write tools).
   */
  const ALLOWED = new Set([
    'src/lib/data/columns.ts', // the owner
    'src/lib/chat/context.ts',
    'src/lib/chat/tools/student-read.ts',
    'src/lib/chat/tools/student-write.ts',
  ]);

  it('is not re-hand-written anywhere new', () => {
    const offenders = walk(SRC)
      .filter((file) => stripComments(readFileSync(file, 'utf8')).includes('program:programs('))
      .map((file) => relative(ROOT, file).split(/[\\/]/).join('/'));

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
  it('parent/data.ts uses the shared one instead of its own', () => {
    const source = read('src/lib/parent/data.ts');
    expect(source).toContain("import { unwrap } from '@/lib/data/errors'");
    expect(source).not.toMatch(/const\s+unwrap\s*=/);
  });
});
