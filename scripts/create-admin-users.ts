/**
 * One-off: create the admin auth users listed in NEW_ADMINS (idempotent).
 *
 * Run with:
 *   npx tsx scripts/create-admin-users.ts
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or
 * SUPABASE_URL) in .env.local.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
};

loadEnvFile('.env.local');

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const NEW_ADMINS = [
  { email: 'guillaume@merindol.co', fullName: 'Guillaume' },
  { email: 'Eileen.guertler@gmail.com', fullName: 'Eileen Guertler' },
  { email: 'keenan@workiflow.com', fullName: 'Keenan Theron' }
];

const getClient = (): SupabaseClient => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new Error(
      'Missing env. Need NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in .env.local'
    );
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
};

const generatePassword = (): string => {
  // 20 bytes -> 27-char base64url, plus a guaranteed digit/symbol so it
  // clears typical password-strength rules.
  const random = crypto.randomBytes(20).toString('base64url');
  return `${random}!9`;
};

const findExistingUser = async (supabase: SupabaseClient, email: string) => {
  let page = 1;
  for (let i = 0; i < 10; i++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 50) break;
    page += 1;
  }
  return null;
};

const ensureAdminUser = async (
  supabase: SupabaseClient,
  email: string,
  fullName: string
): Promise<{ id: string; email: string; password: string | null; created: boolean }> => {
  const existing = await findExistingUser(supabase, email);

  if (existing) {
    console.log(`  Found existing auth user for ${email} (${existing.id})`);
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: existing.id, role: 'admin', full_name: fullName }, { onConflict: 'id' });
    if (error) throw new Error(`profiles upsert failed for ${email}: ${error.message}`);
    return { id: existing.id, email, password: null, created: false };
  }

  const password = generatePassword();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName }
  });
  if (error || !data.user) throw new Error(`createUser failed for ${email}: ${error?.message}`);
  console.log(`  Created auth user for ${email} (${data.user.id})`);

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({ id: data.user.id, role: 'admin', full_name: fullName }, { onConflict: 'id' });
  if (profileError) throw new Error(`profiles upsert failed for ${email}: ${profileError.message}`);

  return { id: data.user.id, email, password, created: true };
};

const main = async () => {
  const supabase = getClient();
  const results = [];

  for (const admin of NEW_ADMINS) {
    console.log(`Processing ${admin.email}…`);
    const result = await ensureAdminUser(supabase, admin.email, admin.fullName);
    results.push(result);
  }

  console.log('\nDone.\n');
  for (const r of results) {
    console.log(`  ${r.email}`);
    console.log(`    id:       ${r.id}`);
    console.log(`    role:     admin`);
    console.log(`    password: ${r.created ? r.password : '(existing user — password unchanged)'}`);
  }
};

main().catch((err) => {
  console.error('\nFailed:', err);
  process.exit(1);
});
