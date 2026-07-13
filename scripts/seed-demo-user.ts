/**
 * Idempotent seed for the May 18 counsellor demo.
 *
 * Ensures `greg@workiflow.com` exists end-to-end:
 *   1. Auth user (created if absent)
 *   2. profiles row with role='student'
 *   3. student_personal_information with email = DEMO_EMAIL (this is the
 *      magic value the matching service / demo helper key off)
 *   4. student_academic_input (A_LEVEL programme, plausible school)
 *   5. student_subjects (3-4 A-Level subjects)
 *   6. student_lifestyle_preference
 *
 * Run with:
 *   npx tsx scripts/seed-demo-user.ts
 *
 * Re-running is safe — every step uses upserts keyed on profile_id.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL (or
 * SUPABASE_URL) in .env.local.
 */

// Load env from .env.local without a dotenv dep.
import * as fs from 'fs';
import * as path from 'path';

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

// Inlined from src/lib/demo/demo-profile.ts — ts-node's ESM resolver doesn't
// handle the src/ alias here, and a one-string duplicate is cheaper than
// wrestling with module resolution.
const DEMO_EMAIL = 'greg@workiflow.com';

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? 'AscendaDemo!2026';
const DEMO_FULL_NAME = 'Greg Franck';

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

const ensureAuthUser = async (supabase: SupabaseClient): Promise<string> => {
  // Try to find an existing user by email. The admin API doesn't have a
  // direct lookup, so paginate listUsers if no env-provided id is given.
  const explicitId = process.env.DEMO_USER_ID;
  if (explicitId) {
    console.log(`  Using DEMO_USER_ID=${explicitId} from env`);
    return explicitId;
  }

  let page = 1;
  // 50 is plenty for a small project; bump if needed.
  for (let i = 0; i < 10; i++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 50 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === DEMO_EMAIL);
    if (match) {
      console.log(`  Found existing auth user ${match.id}`);
      return match.id;
    }
    if (data.users.length < 50) break;
    page += 1;
  }

  console.log(`  Creating auth user ${DEMO_EMAIL}…`);
  const { data, error } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: DEMO_FULL_NAME }
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  console.log(`  Created auth user ${data.user.id}`);
  return data.user.id;
};

const upsertProfile = async (supabase: SupabaseClient, profileId: string) => {
  const { error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: profileId,
        role: 'student',
        full_name: DEMO_FULL_NAME,
        country: 'United Kingdom',
        time_zone: 'Europe/London'
      },
      { onConflict: 'id' }
    );
  if (error) throw new Error(`profiles upsert failed: ${error.message}`);
  console.log('  Upserted profiles row');
};

const upsertPersonal = async (supabase: SupabaseClient, profileId: string) => {
  const { error } = await supabase
    .from('student_personal_information')
    .upsert(
      {
        profile_id: profileId,
        first_name: 'Greg',
        last_name: 'Franck',
        email: DEMO_EMAIL,
        phone: '+44 7700 900123',
        nationality: 'British',
        resident_country: 'United Kingdom',
        age: 17,
        gender: 'male',
        current_location_city: 'London',
        time_zone: 'Europe/London'
      },
      { onConflict: 'profile_id' }
    );
  if (error) throw new Error(`student_personal_information upsert failed: ${error.message}`);
  console.log('  Upserted student_personal_information');
};

const upsertAcademic = async (supabase: SupabaseClient, profileId: string) => {
  const { error } = await supabase
    .from('student_academic_input')
    .upsert(
      {
        profile_id: profileId,
        programme_type: 'A_LEVEL',
        school_name: 'St Martin-in-the-Fields High School',
        school_country: 'United Kingdom',
        school_city: 'London',
        graduation_year: 2026,
        a_level_predicted_grades: {
          Mathematics: 'A*',
          'Further Mathematics': 'A*',
          Physics: 'A',
          'Computer Science': 'A*'
        },
        intended_clusters: ['computer_science', 'maths'],
        secondary_clusters: ['engineering'],
        english_status: 'exceptional',
        english_required: false,
        career_aspiration: 'Software engineer building developer tools',
        language_of_instruction: 'english'
      },
      { onConflict: 'profile_id' }
    );
  if (error) throw new Error(`student_academic_input upsert failed: ${error.message}`);
  console.log('  Upserted student_academic_input');
};

const replaceSubjects = async (supabase: SupabaseClient, profileId: string) => {
  await supabase.from('student_subjects').delete().eq('profile_id', profileId);
  const subjects = [
    { profile_id: profileId, subject_name: 'Mathematics', level: 'A_LEVEL', grade_value: 'A*' },
    { profile_id: profileId, subject_name: 'Further Mathematics', level: 'A_LEVEL', grade_value: 'A*' },
    { profile_id: profileId, subject_name: 'Physics', level: 'A_LEVEL', grade_value: 'A' },
    { profile_id: profileId, subject_name: 'Computer Science', level: 'A_LEVEL', grade_value: 'A*' }
  ];
  const { error } = await supabase.from('student_subjects').insert(subjects);
  if (error) throw new Error(`student_subjects insert failed: ${error.message}`);
  console.log(`  Inserted ${subjects.length} student_subjects`);
};

const upsertLifestyle = async (supabase: SupabaseClient, profileId: string) => {
  const { error } = await supabase
    .from('student_lifestyle_preference')
    .upsert(
      {
        profile_id: profileId,
        teaching_style: 'mixed',
        campus_size: 'medium',
        desired_location_type: 'major_city',
        extracurricular_interests: ['coding_club', 'maths_olympiad', 'hackathons']
      },
      { onConflict: 'profile_id' }
    );
  if (error) throw new Error(`student_lifestyle_preference upsert failed: ${error.message}`);
  console.log('  Upserted student_lifestyle_preference');
};

// Real Supabase program IDs for CS-leaning demo profile.
// Verified live against the demo db on 2026-05-13.
//   Cambridge / Computer Science  — Reach (rank 4)
//   Imperial / Computing          — Reach (rank 7)
//   UCL / Computer Science        — Reach (rank 9)
//   Manchester / Computer Science — Match (rank 29)
//   Warwick / Computer Science    — Match (rank 61)
//   Leeds / Computer Science      — Safe  (rank 93)
const DEMO_APPLICATIONS: Array<{
  programId: string;
  label: string;
  status: 'planning' | 'in_progress' | 'submitted' | 'decision' | 'enrolled';
  notes: string;
  priority: number;
  tasks: Array<{ name: string; due_offset_days: number; status: 'todo' | 'doing' | 'done' }>;
}> = [
  {
    programId: '37b7597a-c85b-54b7-a263-f88b3e277344',
    label: 'Cambridge · Computer Science',
    status: 'in_progress',
    notes: 'Stretch reach — TMUA preparation underway, building portfolio.',
    priority: 92,
    tasks: [
      { name: 'Practice TMUA past papers (2022-2024)', due_offset_days: 4, status: 'doing' },
      { name: 'Polish open-source project for portfolio', due_offset_days: 9, status: 'doing' },
      { name: 'Confirm reference from Ms Okonkwo (CS teacher)', due_offset_days: 8, status: 'doing' },
      { name: 'Personal statement final draft', due_offset_days: 5, status: 'doing' }
    ]
  },
  {
    programId: 'cd952b76-9127-5d28-903c-8e1f4c89fd4f',
    label: 'Imperial · Computing',
    status: 'in_progress',
    notes: 'Top choice — Lloyds Banking Scholar applicant.',
    priority: 88,
    tasks: [
      { name: 'Submit personal statement final draft', due_offset_days: 5, status: 'doing' },
      { name: 'Confirm reference from Ms Okonkwo', due_offset_days: 8, status: 'doing' },
      { name: 'Upload predicted-grades transcript', due_offset_days: 12, status: 'done' },
      { name: 'Attend Imperial offer-holder open day', due_offset_days: 21, status: 'todo' }
    ]
  },
  {
    programId: 'fcb852c2-f36e-5deb-973b-71110547d515',
    label: 'UCL · Computer Science',
    status: 'planning',
    notes: 'Reach — pending decision on whether to apply or focus on Imperial + Cambridge.',
    priority: 70,
    tasks: [
      { name: 'Decide whether to apply (deadline 15 Oct)', due_offset_days: 4, status: 'doing' },
      { name: 'Read course handbook + reach out to current student', due_offset_days: 10, status: 'todo' }
    ]
  },
  {
    programId: 'c4678f36-8c52-5439-8fcb-6cd1181aa984',
    label: 'Manchester · Computer Science',
    status: 'in_progress',
    notes: 'Match — comfortable with the entry requirements, just need to finalise statement.',
    priority: 66,
    tasks: [
      { name: 'Tailor personal statement closing paragraph', due_offset_days: 6, status: 'todo' },
      { name: 'Reference from Ms Okonkwo', due_offset_days: 8, status: 'doing' }
    ]
  },
  {
    programId: 'dbc9c060-5d51-5871-80d6-d59d4821a4f4',
    label: 'Warwick · Computer Science',
    status: 'submitted',
    notes: 'Submitted Oct 12 — waiting on decision.',
    priority: 60,
    tasks: [
      { name: 'Prepare for potential alumni interview', due_offset_days: 25, status: 'todo' }
    ]
  },
  {
    programId: 'e31ba780-1145-5a2f-9ef3-2c094d9165dc',
    label: 'Leeds · Computer Science',
    status: 'submitted',
    notes: 'Safety — submitted, confident on offer.',
    priority: 42,
    tasks: [
      { name: 'Update parents on Leeds offer if it comes through', due_offset_days: 14, status: 'todo' }
    ]
  }
];

const replaceApplications = async (supabase: SupabaseClient, profileId: string) => {
  // Remove existing applications + their checklists for a clean re-seed.
  const { data: existing } = await supabase
    .from('applications')
    .select('id')
    .eq('profile_id', profileId);
  if (existing && existing.length) {
    const ids = existing.map((r: { id: string }) => r.id);
    await supabase.from('application_checklist').delete().in('application_id', ids);
    await supabase.from('applications').delete().in('id', ids);
  }

  for (const app of DEMO_APPLICATIONS) {
    const { data: inserted, error: appError } = await supabase
      .from('applications')
      .insert({
        profile_id: profileId,
        program_id: app.programId,
        status: app.status,
        notes: app.notes
      })
      .select('id')
      .single();
    if (appError || !inserted) {
      throw new Error(`applications insert failed for ${app.label}: ${appError?.message}`);
    }

    const now = new Date();
    const taskRows = app.tasks.map((task) => {
      const due = new Date(now);
      due.setDate(due.getDate() + task.due_offset_days);
      return {
        application_id: inserted.id,
        task_name: task.name,
        status: task.status,
        due_date: due.toISOString().slice(0, 10)
      };
    });
    const { error: taskError } = await supabase.from('application_checklist').insert(taskRows);
    if (taskError) throw new Error(`application_checklist insert failed for ${app.label}: ${taskError.message}`);

    console.log(`  Seeded ${app.label} (${app.tasks.length} tasks)`);
  }
};

// Hand-picked Reach/Match/Safe matches for the demo user. Bypasses the
// matching engine for greg@workiflow.com so the demo always shows a clean,
// credible spread instead of whatever the catalog-wide scoring returns
// (which is flat-93 across thousands of programs).
//
// Each entry holds enough breakdown JSON for the cached-read code path in
// loadMatchesForProfile() to produce a fully-hydrated EnrichedMatch without
// touching the live catalog.
const DEMO_MATCHES: Array<{
  programId: string;
  tier: 'Reach' | 'Match' | 'Safe';
  score: number;
  breakdown: {
    program_name: string;
    program_field: string;
    program_level: string;
    program_language: string;
    program_mode: string;
    program_tuition: number;
    program_currency: string;
    program_url: string | null;
    university_id: string;
    university_name: string;
    university_country: string;
    university_rank_overall: number;
    university_rank_source: string;
    university_requires_test: boolean;
    university_recognition_score: number;
    eligibility: number;
    academicFit: number;
    preferenceFit: number;
    outcomes: number;
  };
}> = [
  // ── Reach (<30% admission chance) ────────────────────────────────────────
  {
    programId: '37b7597a-c85b-54b7-a263-f88b3e277344',
    tier: 'Reach',
    score: 18,
    breakdown: {
      program_name: 'Computer Science',
      program_field: 'Computer Science',
      program_level: 'Undergraduate',
      program_language: 'English',
      program_mode: 'Full-time',
      program_tuition: 9250,
      program_currency: 'GBP',
      program_url: null,
      university_id: 'cambridge-id',
      university_name: 'University of Cambridge',
      university_country: 'United Kingdom',
      university_rank_overall: 4,
      university_rank_source: 'QS World',
      university_requires_test: true,
      university_recognition_score: 10,
      eligibility: 95,
      academicFit: 92,
      preferenceFit: 78,
      outcomes: 96
    }
  },
  {
    programId: 'cd952b76-9127-5d28-903c-8e1f4c89fd4f',
    tier: 'Reach',
    score: 22,
    breakdown: {
      program_name: 'Computing',
      program_field: 'Computer Science',
      program_level: 'Undergraduate',
      program_language: 'English',
      program_mode: 'Full-time',
      program_tuition: 9250,
      program_currency: 'GBP',
      program_url: null,
      university_id: 'imperial-id',
      university_name: 'Imperial College London',
      university_country: 'United Kingdom',
      university_rank_overall: 7,
      university_rank_source: 'QS World',
      university_requires_test: false,
      university_recognition_score: 10,
      eligibility: 96,
      academicFit: 94,
      preferenceFit: 82,
      outcomes: 94
    }
  },
  {
    programId: 'fcb852c2-f36e-5deb-973b-71110547d515',
    tier: 'Reach',
    score: 25,
    breakdown: {
      program_name: 'Computer Science',
      program_field: 'Computer Science',
      program_level: 'Undergraduate',
      program_language: 'English',
      program_mode: 'Full-time',
      program_tuition: 9250,
      program_currency: 'GBP',
      program_url: null,
      university_id: 'ucl-id',
      university_name: 'UCL (University College London)',
      university_country: 'United Kingdom',
      university_rank_overall: 9,
      university_rank_source: 'QS World',
      university_requires_test: false,
      university_recognition_score: 9,
      eligibility: 94,
      academicFit: 90,
      preferenceFit: 85,
      outcomes: 92
    }
  },
  // ── Match ────────────────────────────────────────────────────────────────
  {
    programId: 'dbc9c060-5d51-5871-80d6-d59d4821a4f4',
    tier: 'Match',
    score: 45,
    breakdown: {
      program_name: 'Computer Science',
      program_field: 'Computer Science',
      program_level: 'Undergraduate',
      program_language: 'English',
      program_mode: 'Full-time',
      program_tuition: 9250,
      program_currency: 'GBP',
      program_url: null,
      university_id: 'warwick-id',
      university_name: 'University of Warwick',
      university_country: 'United Kingdom',
      university_rank_overall: 61,
      university_rank_source: 'QS World',
      university_requires_test: false,
      university_recognition_score: 8,
      eligibility: 92,
      academicFit: 86,
      preferenceFit: 80,
      outcomes: 88
    }
  },
  {
    programId: 'c4678f36-8c52-5439-8fcb-6cd1181aa984',
    tier: 'Match',
    score: 42,
    breakdown: {
      program_name: 'Computer Science',
      program_field: 'Computer Science',
      program_level: 'Undergraduate',
      program_language: 'English',
      program_mode: 'Full-time',
      program_tuition: 9250,
      program_currency: 'GBP',
      program_url: null,
      university_id: 'manchester-id',
      university_name: 'University of Manchester',
      university_country: 'United Kingdom',
      university_rank_overall: 29,
      university_rank_source: 'QS World',
      university_requires_test: false,
      university_recognition_score: 8,
      eligibility: 91,
      academicFit: 84,
      preferenceFit: 78,
      outcomes: 85
    }
  },
  {
    programId: '0994d437-27c3-5231-8bd5-a1d011a61f3d',
    tier: 'Match',
    score: 38,
    breakdown: {
      program_name: 'Computer Science',
      program_field: 'Computer Science',
      program_level: 'Undergraduate',
      program_language: 'English',
      program_mode: 'Full-time',
      program_tuition: 9250,
      program_currency: 'GBP',
      program_url: null,
      university_id: 'southampton-id',
      university_name: 'University of Southampton',
      university_country: 'United Kingdom',
      university_rank_overall: 77,
      university_rank_source: 'QS World',
      university_requires_test: false,
      university_recognition_score: 7,
      eligibility: 90,
      academicFit: 82,
      preferenceFit: 76,
      outcomes: 82
    }
  },
  // ── Safe ────────────────────────────────────────────────────────────────
  {
    programId: 'e31ba780-1145-5a2f-9ef3-2c094d9165dc',
    tier: 'Safe',
    score: 77,
    breakdown: {
      program_name: 'Computer Science',
      program_field: 'Computer Science',
      program_level: 'Undergraduate',
      program_language: 'English',
      program_mode: 'Full-time',
      program_tuition: 9250,
      program_currency: 'GBP',
      program_url: null,
      university_id: 'leeds-id',
      university_name: 'University of Leeds',
      university_country: 'United Kingdom',
      university_rank_overall: 93,
      university_rank_source: 'QS World',
      university_requires_test: false,
      university_recognition_score: 6,
      eligibility: 96,
      academicFit: 80,
      preferenceFit: 80,
      outcomes: 78
    }
  },
  {
    programId: 'a4fc623f-ab72-5995-8e45-59c250c0a49f',
    tier: 'Safe',
    score: 75,
    breakdown: {
      program_name: 'Computer Science',
      program_field: 'Computer Science',
      program_level: 'Undergraduate',
      program_language: 'English',
      program_mode: 'Full-time',
      program_tuition: 9250,
      program_currency: 'GBP',
      program_url: null,
      university_id: 'birmingham-id',
      university_name: 'University of Birmingham',
      university_country: 'United Kingdom',
      university_rank_overall: 91,
      university_rank_source: 'QS World',
      university_requires_test: false,
      university_recognition_score: 6,
      eligibility: 95,
      academicFit: 78,
      preferenceFit: 78,
      outcomes: 76
    }
  },
  {
    programId: '172c5384-481a-5bfc-a827-009382b991b6',
    tier: 'Safe',
    score: 72,
    breakdown: {
      program_name: 'Computer Science',
      program_field: 'Computer Science',
      program_level: 'Undergraduate',
      program_language: 'English',
      program_mode: 'Full-time',
      program_tuition: 9250,
      program_currency: 'GBP',
      program_url: null,
      university_id: 'sheffield-id',
      university_name: 'University of Sheffield',
      university_country: 'United Kingdom',
      university_rank_overall: 96,
      university_rank_source: 'QS World',
      university_requires_test: false,
      university_recognition_score: 6,
      eligibility: 95,
      academicFit: 78,
      preferenceFit: 76,
      outcomes: 74
    }
  }
];

const replaceMatches = async (supabase: SupabaseClient, profileId: string) => {
  // Wipe the catalog-wide cache for this profile so the demo set is what
  // the engine returns. The cache lookup orders by score desc + filters
  // by a 5-minute window around the latest created_at, so giving every
  // demo row a slightly staggered timestamp keeps them in the same window.
  await supabase.from('student_matches').delete().eq('profile_id', profileId);

  // Fetch real university ids for each program so the breakdown JSON has
  // a workable university_id (the hand-written ones above are placeholders).
  const programIds = DEMO_MATCHES.map((m) => m.programId);
  const { data: progs } = await supabase
    .from('programs')
    .select('id, university_id, course_name, university:universities(id, name, country, rank_overall)')
    .in('id', programIds);

  const baseAt = Date.now();
  const rows = DEMO_MATCHES.map((m, idx) => {
    const prog = (progs ?? []).find((p: any) => p.id === m.programId);
    const realUniversityId = (prog?.university as any)?.id ?? prog?.university_id ?? null;
    const breakdown = {
      ...m.breakdown,
      university_id: realUniversityId ?? m.breakdown.university_id,
      tier: m.tier
    };
    return {
      profile_id: profileId,
      program_id: m.programId,
      score: m.score,
      breakdown,
      created_at: new Date(baseAt + idx * 100).toISOString()
    };
  });

  const { error } = await supabase.from('student_matches').insert(rows);
  if (error) throw new Error(`student_matches insert failed: ${error.message}`);
  console.log(`  Replaced student_matches with ${rows.length} hand-picked rows (3 Reach · 3 Match · 3 Safe)`);
};

const main = async () => {
  console.log(`Seeding demo user ${DEMO_EMAIL}…`);
  const supabase = getClient();

  const profileId = await ensureAuthUser(supabase);
  await upsertProfile(supabase, profileId);
  await upsertPersonal(supabase, profileId);
  await upsertAcademic(supabase, profileId);
  await replaceSubjects(supabase, profileId);
  await upsertLifestyle(supabase, profileId);
  await replaceApplications(supabase, profileId);
  await replaceMatches(supabase, profileId);

  console.log('\nDone.');
  console.log(`  Profile id: ${profileId}`);
  console.log(`  Email:      ${DEMO_EMAIL}`);
  console.log(`  Password:   ${DEMO_PASSWORD}`);
  console.log('\nLog in, run profile completeness once, then matches will use the demo tier mix.');
};

main().catch((err) => {
  console.error('\nSeed failed:', err);
  process.exit(1);
});
