/**
 * @jest-environment ./jest.environment-node.js
 *
 * (Node environment, not jsdom: `@/lib/auth/policy` is server-only and throws
 * when `window` is defined — the guard that keeps identity resolution out of a
 * client bundle. Same docblock the route-handler suites use.)
 */

/**
 * The app-side portal flags and the SQL that backs them must agree.
 *
 * ── The coordination failure this prevents ─────────────────────────────────
 * `COUNSELLOR_PORTAL_OPEN_TO_ALL` / `PARENT_PORTAL_OPEN_TO_ALL` in
 * src/lib/auth/policy.ts decide whether the APP lets a non-counsellor reach
 * /counsellor and /parent. `can_act_as_counsellor()` in the database decides
 * whether they can READ anything once there.
 *
 * They are two halves of one decision, in two repositories of truth, flipped by
 * two different actions — an app deploy and a `db:apply`. Applying
 * 20260801120000 (which closes the SQL side) without flipping the flags does not
 * error: the pages still render, RLS returns nothing, and every counsellor
 * dashboard and the whole parent portal go SILENTLY EMPTY. A reviewer found
 * exactly that and no test could see it.
 *
 * This asserts the two halves are consistent, so the pair must move together or
 * CI goes red. It reads the SQL as text — it does not need a database, and it
 * deliberately does not care WHICH posture is in force, only that both layers
 * are in the same one.
 *
 * WHEN YOU APPLY 20260801120000: set both flags to false in the same commit.
 * That is the whole procedure, and this test is what makes forgetting it loud.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { COUNSELLOR_PORTAL_OPEN_TO_ALL, PARENT_PORTAL_OPEN_TO_ALL } from '@/lib/auth/policy';

const ROOT = join(__dirname, '..', '..');
const schema = readFileSync(join(ROOT, 'supabase', 'schema.sql'), 'utf8');

/**
 * Is the DEPLOYED definition of can_act_as_counsellor() the open one?
 *
 * schema.sql is the repo's record of what production runs. The open form is the
 * bare `auth.uid() is not null`; the closed form delegates to is_counsellor().
 */
const sqlIsOpenToAll = (): boolean => {
  const match = schema.match(
    /create or replace function public\.can_act_as_counsellor\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/
  );
  if (!match) throw new Error('can_act_as_counsellor() not found in schema.sql — this test is stale');
  const body = match[1];
  const open = /auth\.uid\(\)\s+is\s+not\s+null/.test(body);
  const closed = /is_counsellor\(\)/.test(body);
  if (open === closed) {
    throw new Error(`can_act_as_counsellor() body matched neither posture cleanly:\n${body}`);
  }
  return open;
};

describe('portal access: the app and the database must agree', () => {
  it('the counsellor flag matches the deployed can_act_as_counsellor()', () => {
    expect(COUNSELLOR_PORTAL_OPEN_TO_ALL).toBe(sqlIsOpenToAll());
  });

  it('the parent portal is not closed while its data path still runs through the counsellor guard', () => {
    // /parent reads child data through can_act_as_counsellor() until a parent
    // read path exists (migration step 10). Closing the app side first would
    // lock every parent out of their own child's data with no error shown.
    if (!sqlIsOpenToAll()) {
      expect(PARENT_PORTAL_OPEN_TO_ALL).toBe(false);
    } else {
      expect(PARENT_PORTAL_OPEN_TO_ALL).toBe(true);
    }
  });

  it("the closing migration exists and is still unapplied, so the flags' current value is the right one", () => {
    // If someone applies 20260801120000 they must edit schema.sql to match (that
    // is how this repo records what production runs). The first test then fails
    // until the flags follow. This one just proves the migration is present, so
    // the pair above cannot silently pass because a file was deleted.
    const migration = readFileSync(
      join(ROOT, 'supabase', 'migrations', '20260801120000_close_counsellor_access_and_split_write_policies.sql'),
      'utf8'
    );
    expect(migration).toContain('is_counsellor()');
  });
});
