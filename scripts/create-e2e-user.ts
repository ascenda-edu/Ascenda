/**
 * Create (or reset) the THROWAWAY account the Playwright wizard spec drives.
 *
 * WHY THIS EXISTS
 * ---------------
 * `e2e/profile-wizard.e2e.ts` has never run. It needs a real account, because
 * `/profile/wizard` sits behind middleware and there is deliberately no
 * test-only auth bypass — adding one would be the "never weaken auth to make a
 * test pass" rule broken in the most direct way possible.
 *
 * Open signup is DISABLED on this project, so the account cannot be made through
 * the UI. This uses the service-role admin API, the same way
 * `scripts/create-admin-users.ts` and `scripts/seed-demo-user.ts` already do.
 *
 * READ THIS BEFORE RUNNING
 * ------------------------
 * There is ONE Supabase project, so this account is created in PRODUCTION. It is
 * a real row in `auth.users`. The wizard spec then completes the wizard and
 * saves, which OVERWRITES this account's `student_*` rows every run — that is
 * by design and is why the account must be disposable and must never be a real
 * person's.
 *
 * The address is deliberately `+e2e@` on a domain nobody reads, and the password
 * is generated, printed once, and never stored in the repo.
 *
 * Idempotent: re-running finds the existing user and resets its password rather
 * than failing, so a lost password is recoverable without orphaning the row.
 *
 *   npm run e2e:user
 *
 * Then export what it prints and run the spec:
 *   E2E_EMAIL=… E2E_PASSWORD=… npm run test:e2e
 *
 * To remove it afterwards:
 *   npm run e2e:user:delete
 *
 * That deletes the `profiles` row FIRST so the `on delete cascade` on every
 * `student_*` table runs, then the auth user. Doing it the other way round —
 * which is what the Supabase dashboard's "delete user" button does — leaves the
 * profile and all six tables of student data orphaned, because `profiles.id` has
 * no foreign key to `auth.users`.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const loadEnvFile = (filename: string): void => {
  const filePath = path.resolve(process.cwd(), filename);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};

loadEnvFile('.env.local');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  process.exit(1);
}

/** Fixed so re-running targets the same row instead of littering auth.users. */
const E2E_EMAIL = process.env.E2E_EMAIL ?? 'ascenda+e2e@example.invalid';

/**
 * Remove the account and everything it owns.
 *
 * ORDER MATTERS. Every `student_*` table references `profiles(id) on delete
 * cascade`, but `profiles.id` has NO foreign key to `auth.users` (it is a plain
 * `primary key default gen_random_uuid()`). So deleting the auth user first
 * orphans the profile row and all six tables of student data under it, invisibly.
 * Delete the profile FIRST and let the cascade run, then the auth user.
 */
const destroy = async (supabase: SupabaseClient) => {
  let id: string | null = null;
  for (let page = 1; page <= 20 && !id; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    if (data.users.length === 0) break;
    id = data.users.find((u) => u.email === E2E_EMAIL)?.id ?? null;
  }

  if (!id) {
    console.log(`Nothing to delete — no auth user with email ${E2E_EMAIL}.`);
    return;
  }

  // Report what the cascade is about to take, so the deletion is not silent.
  for (const table of [
    'student_personal_information',
    'student_academic_input',
    'student_subjects',
    'student_lifestyle_preference',
    'student_activities',
    'student_scores',
    'student_matches'
  ] as const) {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('profile_id', id);
    if (!error) console.log(`  ${String(count ?? 0).padStart(4)} rows in ${table}`);
  }

  const { error: profileError } = await supabase.from('profiles').delete().eq('id', id);
  if (profileError) throw new Error(`profiles delete failed: ${profileError.message}`);
  console.log('✓ Deleted the profiles row (cascaded every student_* row above).');

  const { error: userError } = await supabase.auth.admin.deleteUser(id);
  if (userError) throw new Error(`deleteUser failed: ${userError.message}`);
  console.log(`✓ Deleted the auth user ${id} (${E2E_EMAIL}).`);
  console.log('');
  console.log('Recreate it any time with: npm run e2e:user');
};

const main = async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  if (process.argv.includes('--delete')) {
    await destroy(supabase);
    return;
  }

  // 24 bytes of entropy, printed once. Never written to the repo.
  const password = `E2e-${crypto.randomBytes(18).toString('base64url')}`;

  // `listUsers` has no email filter, so page through looking for ours. The user
  // table on this project is small; if that stops being true, switch to the
  // admin `getUserByEmail` endpoint.
  let existingId: string | null = null;
  for (let page = 1; page <= 20 && !existingId; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    if (data.users.length === 0) break;
    existingId = data.users.find((u) => u.email === E2E_EMAIL)?.id ?? null;
  }

  if (existingId) {
    const { error } = await supabase.auth.admin.updateUserById(existingId, { password });
    if (error) throw new Error(`password reset failed: ${error.message}`);
    console.log(`↻ Reset the password for the existing E2E user (${existingId}).`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: E2E_EMAIL,
      password,
      email_confirm: true
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    existingId = data.user.id;
    console.log(`✓ Created the E2E user (${existingId}).`);
  }

  // The wizard spec signs in and lands on /profile/wizard, which needs a
  // profiles row. `handle_new_user` may already have made one; upsert so this is
  // idempotent either way, and pin role='student' so the student portal renders.
  // NOTE: `profiles` has no `email` column — the address lives in `auth.users`
  // and, for students, in `student_personal_information.email`. Writing one here
  // fails with "Could not find the 'email' column of 'profiles' in the schema
  // cache", which is what the first run of this script did.
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: existingId, role: 'student', full_name: 'E2E Wizard Account' }, { onConflict: 'id' });
  if (profileError) throw new Error(`profiles upsert failed: ${profileError.message}`);

  // Prove the credentials work through the ANON client — the same path the app
  // and the Playwright setup take. Without this, a failed login in the browser
  // is ambiguous between "bad account" and "bug in the sign-in form", and the
  // first run of this script hit exactly that ambiguity.
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (anonKey) {
    const anon = createClient(SUPABASE_URL, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: E2E_EMAIL,
      password
    });
    if (signInError) {
      console.error(`✗ signInWithPassword REJECTED these credentials: ${signInError.message}`);
      console.error('  The account exists but cannot log in — fix that before blaming the app.');
      process.exit(1);
    }
    console.log(`✓ signInWithPassword accepted them (session for ${signIn.user?.id}).`);

    // Exercise the four completion reads the login form runs BEFORE it
    // navigates (`determineRedirectTarget` in components/forms/auth-form.tsx).
    // If any of them hangs — an RLS policy that recurses, say — the browser
    // sits on /login with no error, which is indistinguishable from a rejected
    // password. Time-box them so a hang reports as a hang.
    const uid = signIn.user?.id as string;
    const timed = async <T,>(label: string, p: PromiseLike<T>) => {
      const started = Date.now();
      const result = await Promise.race([
        p,
        new Promise((_, reject) => setTimeout(() => reject(new Error('TIMED OUT after 15s')), 15_000))
      ]).catch((e: unknown) => ({ error: e instanceof Error ? { message: e.message } : e }) as never);
      const ms = Date.now() - started;
      const err = (result as { error?: { message?: string } })?.error;
      console.log(`  ${err ? '✗' : '✓'} ${label.padEnd(32)} ${ms}ms${err ? '  ' + err.message : ''}`);
      return result;
    };

    console.log('post-login completion reads (what determineRedirectTarget does):');
    await timed('profiles', anon.from('profiles').select('id,role').eq('id', uid).maybeSingle());
    await timed('student_personal_information', anon.from('student_personal_information').select('first_name').eq('profile_id', uid).maybeSingle());
    await timed('student_academic_input', anon.from('student_academic_input').select('programme_type').eq('profile_id', uid).maybeSingle());
    await timed('student_lifestyle_preference', anon.from('student_lifestyle_preference').select('extracurricular_interests').eq('profile_id', uid).maybeSingle());
    await timed('student_subjects', anon.from('student_subjects').select('id').eq('profile_id', uid));
  }

  console.log('');
  console.log('Run the spec with these — the password is shown ONCE:');
  console.log('');
  console.log(`  export E2E_EMAIL='${E2E_EMAIL}'`);
  console.log(`  export E2E_PASSWORD='${password}'`);
  console.log('  npm run test:e2e');
  console.log('');
  console.log('This account lives in PRODUCTION auth.users and the spec overwrites its');
  console.log('student_* rows on every run. Delete it in the Supabase dashboard when done.');
};

main().catch((err) => {
  console.error('✗', err instanceof Error ? err.message : err);
  process.exit(1);
});
