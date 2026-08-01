/**
 * Seed ~25 realistic student profiles so the counsellor dashboard has real data.
 *
 * Runs against the REMOTE Supabase project (where the 119k-row catalogue lives)
 * using the service-role key (BYPASSRLS). Idempotent: deletes any prior
 * `*+seed@ascenda.demo` users before re-seeding.
 *
 *   npm run seed:students            # 25 students
 *   npm run seed:students -- --count=12
 *   npm run seed:students -- --teardown   # remove seeded students only
 *
 * Requires .env.local with SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL
 * + SEED_STUDENT_PASSWORD (the password given to every seeded account — no
 * default; the script refuses to run without it).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';

// ── load .env.local (tsx does not do this automatically) ─────────────────────
const loadEnv = () => {
  const path = resolve(process.cwd(), '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = val;
  }
};
loadEnv();

import { createServiceRoleSupabaseClient } from '@/lib/supabase/service';
import { writeStudentIntake } from '@/lib/profile/persist-intake';
import type {
  StudentProfilePayload,
  IntendedCluster,
  AdmissionsTestType,
} from '@/lib/profile/intake-types';

/** Required env read — no fallback default (never hardcode credentials). */
const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing ${name}. Set it in .env.local (no default is provided) before running this script.`
    );
    process.exit(1);
  }
  return value;
};

const SEED_EMAIL_SUFFIX = '+seed@ascenda.demo';
// Password applied to every seeded `*+seed@ascenda.demo` account.
const SEED_PASSWORD = requireEnv('SEED_STUDENT_PASSWORD');
// Distinctive marker on seed-created catalogue deadlines so teardown removes only
// our rows (and never a real catalogue deadline).
const SEED_DEADLINE_INTAKE = 'Fall 2026 (seed)';
// Only ever clean the distinctive seed marker — NOT a plausible real intake like
// 'Fall 2026', which a future catalogue load could legitimately use.
const SEED_DEADLINE_INTAKES = [SEED_DEADLINE_INTAKE];

type Client = SupabaseClient<any>;
const db = (s: Client) => s as any; // tables/columns that lag the generated types

const rng = (seed: number) => {
  // deterministic pseudo-random for reproducible variety
  let x = seed * 9301 + 49297;
  return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
};
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString();
const daysFromNow = (n: number) => new Date(Date.now() + n * 86400000);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ── student archetypes ───────────────────────────────────────────────────────

interface Spec {
  first: string; last: string; nationality: string; country: string; city: string;
  gender: 'female' | 'male' | 'non_binary' | 'prefer_not_to_say';
  programme: 'IB' | 'A_LEVEL';
  cluster: IntendedCluster; secondary: IntendedCluster;
  career: string;
  quality: 'high' | 'mid' | 'low';          // drives grades + match tiering
  completeness: 'full' | 'no_subjects' | 'no_clusters' | 'minimal';
  stalled?: boolean;
  test?: AdmissionsTestType;
}

const FIRST = ['Aarav', 'Sofia', 'Liam', 'Yuki', 'Amara', 'Wei', 'Isabella', 'Fatima', 'Carlos', 'Anika', 'Noah', 'Mei', 'Omar', 'Elena', 'Raj', 'Chloe', 'Diego', 'Priya', 'Tom', 'Lucia', 'Hassan', 'Grace', 'Kenji', 'Zara', 'Felix'];
const LAST = ['Sharma', 'Chen', "O'Brien", 'Tanaka', 'Okafor', 'Zhang', 'Rossi', 'Al-Hassan', 'Silva', 'Patel', 'Williams', 'Lin', 'Khan', 'Petrova', 'Mehta', 'Dubois', 'Garcia', 'Iyer', 'Schmidt', 'Fernandez', 'Ali', 'Adeyemi', 'Sato', 'Ahmed', 'Müller'];
const NAT = ['Indian', 'Chinese', 'Irish', 'Japanese', 'Nigerian', 'Chinese', 'Italian', 'Emirati', 'Brazilian', 'Indian', 'British', 'Singaporean', 'Pakistani', 'Russian', 'Indian', 'French', 'Mexican', 'Indian', 'German', 'Spanish', 'Pakistani', 'Nigerian', 'Japanese', 'Emirati', 'German'];
const COUNTRY = ['India', 'China', 'Ireland', 'Japan', 'Nigeria', 'China', 'Italy', 'UAE', 'Brazil', 'India', 'UK', 'Singapore', 'Pakistan', 'Russia', 'India', 'France', 'Mexico', 'India', 'Germany', 'Spain', 'Pakistan', 'Nigeria', 'Japan', 'UAE', 'Germany'];
const CITY = ['Mumbai', 'Hong Kong', 'Dublin', 'Tokyo', 'Lagos', 'Shanghai', 'Milan', 'Dubai', 'São Paulo', 'Pune', 'London', 'Singapore', 'Karachi', 'Moscow', 'Delhi', 'Paris', 'Mexico City', 'Bangalore', 'Berlin', 'Madrid', 'Lahore', 'Abuja', 'Osaka', 'Abu Dhabi', 'Munich'];

const CLUSTERS: IntendedCluster[] = ['computer_science', 'engineering', 'economics_quant', 'medicine_dentistry', 'law', 'humanities', 'business_non_quant', 'life_sciences_biochem', 'maths', 'creative'];
const CAREERS: Record<string, string> = {
  computer_science: 'Software engineer or AI researcher',
  engineering: 'Mechanical / aerospace engineer',
  economics_quant: 'Economist or investment analyst',
  medicine_dentistry: 'Doctor specialising in paediatrics',
  law: 'Corporate or human-rights lawyer',
  humanities: 'Policy researcher or academic',
  business_non_quant: 'Entrepreneur / management consultant',
  life_sciences_biochem: 'Biomedical researcher',
  maths: 'Quantitative researcher',
  creative: 'Architect or designer',
};
const TEST_FOR: Partial<Record<IntendedCluster, AdmissionsTestType>> = {
  computer_science: 'TMUA', engineering: 'ESAT', medicine_dentistry: 'UCAT', law: 'LNAT', economics_quant: 'TSA', maths: 'STEP',
};
const SUBJECTS_FOR: Record<string, string[]> = {
  computer_science: ['Mathematics', 'Computer Science', 'Physics'],
  engineering: ['Mathematics', 'Physics', 'Chemistry'],
  economics_quant: ['Mathematics', 'Economics', 'History'],
  medicine_dentistry: ['Biology', 'Chemistry', 'Mathematics'],
  law: ['History', 'English Literature', 'Politics'],
  humanities: ['History', 'English Literature', 'Philosophy'],
  business_non_quant: ['Economics', 'Mathematics', 'Business'],
  life_sciences_biochem: ['Biology', 'Chemistry', 'Mathematics'],
  maths: ['Mathematics', 'Further Mathematics', 'Physics'],
  creative: ['Art', 'Design Technology', 'English Literature'],
};

const buildSpecs = (count: number): Spec[] => {
  const specs: Spec[] = [];
  for (let i = 0; i < count; i++) {
    const cluster = CLUSTERS[i % CLUSTERS.length];
    const secondary = CLUSTERS[(i + 3) % CLUSTERS.length];
    const quality: Spec['quality'] = i % 5 === 0 ? 'low' : i % 3 === 0 ? 'mid' : 'high';
    // Spread completion across 100% / 75% / 50% so the analytics breakdown and the
    // low-completion at-risk alert (<70%) have a believable cohort to surface.
    const completeness: Spec['completeness'] =
      i % 8 === 5 ? 'minimal'        // ~3 → 50% (missing academic + subjects)
      : i % 8 === 2 ? 'no_subjects'  // ~3 → 75%
      : i % 8 === 6 ? 'no_clusters'  // ~3 → 75%
      : 'full';                      // rest → 100%
    specs.push({
      first: FIRST[i % FIRST.length],
      last: LAST[i % LAST.length],
      nationality: NAT[i % NAT.length],
      country: COUNTRY[i % COUNTRY.length],
      city: CITY[i % CITY.length],
      gender: i % 2 === 0 ? 'male' : 'female',
      programme: i % 3 === 0 ? 'A_LEVEL' : 'IB',
      cluster,
      secondary,
      career: CAREERS[cluster],
      quality,
      completeness,
      stalled: i % 7 === 3,
      test: TEST_FOR[cluster],
    });
  }
  return specs;
};

// ── payload generation ───────────────────────────────────────────────────────

const ibPointsFor = (q: Spec['quality']) => (q === 'high' ? 40 + Math.floor(Math.random() * 5) : q === 'mid' ? 35 + Math.floor(Math.random() * 3) : 30 + Math.floor(Math.random() * 4));
const aLevelGradeFor = (q: Spec['quality']) => (q === 'high' ? 'A*' : q === 'mid' ? 'A' : 'B') as 'A*' | 'A' | 'B';

const buildPayload = (spec: Spec, email: string): StudentProfilePayload => {
  const subjectsBase = SUBJECTS_FOR[spec.cluster] ?? ['Mathematics', 'English Literature', 'Economics'];
  const isIB = spec.programme === 'IB';
  const includeSubjects = spec.completeness !== 'no_subjects' && spec.completeness !== 'minimal';
  const includeClusters = spec.completeness !== 'no_clusters' && spec.completeness !== 'minimal';
  const includeLifestyle = spec.completeness !== 'minimal';

  const subjectList = includeSubjects
    ? subjectsBase.map((name, idx) => ({
        subject_name: name,
        level: (isIB ? (idx < 2 ? 'HL' : 'SL') : 'A_LEVEL') as 'HL' | 'SL' | 'A_LEVEL',
        grade_value: isIB ? (spec.quality === 'high' ? 7 : spec.quality === 'mid' ? 6 : 5) : aLevelGradeFor(spec.quality),
      }))
    : [];

  const aLevelGrades = !isIB && includeSubjects
    ? Object.fromEntries(subjectsBase.map((s) => [s, aLevelGradeFor(spec.quality)]))
    : null;

  return {
    personal_information: {
      first_name: spec.first,
      last_name: spec.last,
      email,
      phone: null,
      nationality: spec.nationality,
      age: 17 + (spec.quality === 'low' ? 1 : 0),
      gender: spec.gender,
      resident_country: spec.country,
      current_location_city: spec.city,
      time_zone: null,
    },
    academic_input: {
      programme_type: spec.programme,
      school_name: `${spec.city} International School`,
      school_country: spec.country,
      school_city: spec.city,
      school_type: 'international_school',
      language_of_instruction: 'english',
      graduation_year: 2026,
      desired_start_date: '2026-09-01',
      intended_clusters: includeClusters ? [spec.cluster] : [],
      secondary_clusters: includeClusters ? [spec.secondary] : [],
      career_aspiration: spec.career,
      subject_list: subjectList,
      ib_total_points: isIB && includeSubjects ? ibPointsFor(spec.quality) : null,
      ib_core_points: isIB ? 2 : null,
      ib_tok_grade: isIB ? 'B' : null,
      ib_ee_grade: isIB ? 'B' : null,
      ib_math_pathway: isIB ? 'AA_HL' : null,
      ee_subject: isIB ? subjectsBase[0] : null,
      ee_title: isIB ? `Investigation in ${subjectsBase[0]}` : null,
      ee_summary: null,
      a_level_predicted_grades: aLevelGrades,
      english_required: spec.nationality === 'British' ? false : true,
      english_test_type: spec.nationality === 'British' ? 'WAIVER' : 'IELTS',
      english_status: spec.quality === 'low' ? 'missing' : spec.quality === 'mid' ? 'booked' : 'met',
      english_score_overall: spec.quality === 'high' ? 7.5 : null,
      admissions_tests: spec.test
        ? [{ test_type: spec.test, status: spec.quality === 'high' ? 'taken' : 'booked', score_numeric: spec.quality === 'high' ? 6.5 : null, percentile: null }]
        : [],
    },
    lifestyle_preference: {
      teaching_style: includeLifestyle ? (spec.quality === 'high' ? 'academic' : 'mixed') : null,
      desired_location_type: includeLifestyle ? 'major_city' : null,
      campus_size: includeLifestyle ? 'large' : null,
      extracurricular_interests: includeLifestyle ? ['Debate', 'Volunteering', 'Sport'] : [],
      other_extracurriculars: null,
      leadership_roles: includeLifestyle ? ['Student council'] : [],
      commitment_level: includeLifestyle ? 'high' : null,
      key_activities: includeLifestyle ? ['Debate club', 'Volunteering'] : [],
      sat_score: null,
      act_score: null,
      intl_experience: [],
      work_experience: includeLifestyle ? true : null,
      work_experience_summary: includeLifestyle ? 'Summer internship in field of interest' : null,
      ambition_statement: spec.career,
      epq_subject: !isIB && includeLifestyle ? subjectsBase[0] : null,
      epq_title: !isIB && includeLifestyle ? `Extended project on ${subjectsBase[0]}` : null,
    },
    activities_list: includeLifestyle
      ? [
          { category: 'Leadership', level: 'School' as const, duration: '1–2 years' as const, highlight: 'Led the student council', sort_order: 0 },
          { category: 'Volunteering', level: 'Regional' as const, duration: '3–4 years' as const, highlight: 'Community tutoring programme', sort_order: 1 },
        ]
      : [],
  };
};

// ── catalogue → curated matches ──────────────────────────────────────────────

const CLUSTER_KEYWORD: Record<string, string> = {
  computer_science: 'Computer Science', engineering: 'Engineering', economics_quant: 'Economics',
  medicine_dentistry: 'Medicine', law: 'Law', humanities: 'History', business_non_quant: 'Business',
  life_sciences_biochem: 'Biology', maths: 'Mathematics', creative: 'Design',
};

interface ProgRow { id: string; course_name: string; recognition: number; }

const fetchProgramsForCluster = async (supabase: Client, cluster: string): Promise<ProgRow[]> => {
  const keyword = CLUSTER_KEYWORD[cluster] ?? 'Science';
  const run = async (filter: boolean) => {
    let q = supabase.from('programs').select('id, course_name, universities(recognition_score)').limit(60);
    if (filter) q = q.ilike('course_name', `%${keyword}%`);
    const { data } = await q;
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      course_name: r.course_name ?? 'Programme',
      recognition: (Array.isArray(r.universities) ? r.universities[0] : r.universities)?.recognition_score ?? 0,
    }));
  };
  let rows = await run(true);
  if (rows.length < 6) rows = await run(false);
  return rows.sort((a, b) => b.recognition - a.recognition);
};

type Tier = 'Reach' | 'Match' | 'Safe';

/** Picks ~6 programs across a Reach/Match/Safe spread (by university recognition). */
const curateMatches = (rows: ProgRow[]): Array<{ program_id: string; score: number; tier: Tier }> => {
  if (rows.length === 0) return [];
  const n = rows.length;
  const pick = (frac: number) => rows[Math.min(n - 1, Math.floor(frac * n))];
  const chosen: Array<{ row: ProgRow; tier: Tier; score: number }> = [
    { row: pick(0.0), tier: 'Reach', score: 62 + Math.floor(Math.random() * 8) },
    { row: pick(0.12), tier: 'Reach', score: 64 + Math.floor(Math.random() * 6) },
    { row: pick(0.4), tier: 'Match', score: 75 + Math.floor(Math.random() * 8) },
    { row: pick(0.55), tier: 'Match', score: 78 + Math.floor(Math.random() * 6) },
    { row: pick(0.8), tier: 'Safe', score: 87 + Math.floor(Math.random() * 5) },
    { row: pick(0.95), tier: 'Safe', score: 90 + Math.floor(Math.random() * 5) },
  ];
  const seen = new Set<string>();
  return chosen
    .filter((c) => c.row && !seen.has(c.row.id) && seen.add(c.row.id))
    .map((c) => ({ program_id: c.row.id, score: c.score, tier: c.tier }));
};

// ── per-student seeding ───────────────────────────────────────────────────────

const NOTE_BODIES = [
  'Strong candidate — encouraged early-decision application to top choice.',
  'Reviewed personal statement draft; suggested sharpening the opening.',
  'Flagged: UCAS form not started yet. Chased by email.',
  'Discussed application strategy and added a safe choice.',
  'Mock interview completed — confident and well prepared.',
];

const seedStudent = async (supabase: Client, spec: Spec, idx: number, deadlinePrograms: Set<string>): Promise<string | null> => {
  const email = `${spec.first.toLowerCase()}.${spec.last.toLowerCase().replace(/[^a-z]/g, '')}.${idx}${SEED_EMAIL_SUFFIX}`;

  const { data: created, error: createErr } = await (supabase as any).auth.admin.createUser({
    email,
    password: SEED_PASSWORD,
    email_confirm: true,
    user_metadata: { seeded: true, role: 'student' },
  });
  if (createErr || !created?.user) {
    console.error(`  ✗ createUser failed for ${email}: ${createErr?.message}`);
    return null;
  }
  const id = created.user.id;

  // profile + all student_* tables + score
  await writeStudentIntake(supabase as any, id, buildPayload(spec, email));

  // curated matches from the real catalogue
  const progRows = await fetchProgramsForCluster(supabase, spec.cluster);
  const matches = curateMatches(progRows);
  if (matches.length > 0) {
    await db(supabase).from('student_matches').insert(
      matches.map((m) => ({
        profile_id: id,
        program_id: m.program_id,
        score: m.score,
        breakdown: { tier: m.tier, seeded: true },
      }))
    );
  }

  // applications from a few of the matches; varied status + some decisions
  const r = rng(idx + 1);
  // Apply ACROSS tiers (curateMatches order is [Reach,Reach,Match,Match,Safe,Safe]),
  // so each student has a Reach/Match/Safe spread and Outcomes isn't "Safe 0%".
  const appCount = 3 + Math.floor(r() * 2); // 3–4
  const appProgs = [0, 2, 4, 3].slice(0, appCount).map((i) => matches[i]).filter(Boolean);
  const statuses = ['planning', 'in_progress', 'submitted', 'submitted', 'decision'];
  const decisions = ['accepted', 'rejected', 'waitlisted', null];
  for (let i = 0; i < appProgs.length; i++) {
    const m = appProgs[i];
    const status = spec.stalled ? (i === 0 ? 'in_progress' : 'planning') : statuses[(idx + i) % statuses.length];
    const decided = status === 'decision' || (status === 'submitted' && i % 2 === 0);
    const decision = decided ? decisions[(idx + i) % decisions.length] : null;
    await db(supabase).from('applications').insert({
      profile_id: id,
      program_id: m.program_id,
      status,
      platform: 'UCAS',
      decision,
      decision_at: decision ? daysAgo(5 + (i * 3)) : null,
      decision_conditions: decision === 'accepted' && m.tier === 'Reach' ? 'Conditional on final grades' : null,
      notes: null,
    });
    // one program-level deadline per program across the WHOLE run (deadlines are
    // catalogue-scoped, shared by all students who applied to that programme).
    // Marked with a distinctive intake so teardown can remove only seed rows.
    if (!deadlinePrograms.has(m.program_id)) {
      deadlinePrograms.add(m.program_id);
      const kind = i === 0 ? 'Early Decision' : i === 1 ? 'Regular Decision' : 'Scholarship deadline';
      const offset = spec.stalled && i === 0 ? 6 : 18 + (idx % 40) + i * 10; // some urgent
      await db(supabase).from('deadlines').insert({
        program_id: m.program_id,
        name: kind,
        deadline_date: isoDate(daysFromNow(offset)),
        intake: SEED_DEADLINE_INTAKE,
      });
    }
  }

  // counsellor notes (back-dated → drives the activity feed)
  const noteCount = 1 + (idx % 3);
  await db(supabase).from('counsellor_notes').insert(
    Array.from({ length: noteCount }, (_, i) => ({
      student_profile_id: id,
      author_profile_id: id, // self-authored placeholder; real notes use the counsellor's id
      body: NOTE_BODIES[(idx + i) % NOTE_BODIES.length],
      note_type: i === 0 ? 'session' : i === 1 ? 'update' : 'flag',
      created_at: daysAgo(3 + i * 9 + (idx % 5)),
    }))
  );

  // parent contact + a short thread (about 2/3 of students)
  if (idx % 3 !== 2) {
    const relationship = idx % 2 === 0 ? 'Mother' : 'Father';
    const { data: contact } = await db(supabase)
      .from('parent_contacts')
      .insert({
        student_profile_id: id,
        parent_name: `${relationship === 'Mother' ? 'Mrs.' : 'Mr.'} ${spec.last}`,
        relationship,
        email: `parent.${spec.last.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
        phone: '+00 000 000 0000',
        status: idx % 4 === 0 ? 'needs-response' : idx % 4 === 1 ? 'resolved' : 'active',
        last_contacted: daysAgo(2 + (idx % 14)),
      })
      .select('id')
      .single();
    if (contact?.id) {
      await db(supabase).from('parent_messages').insert([
        { contact_id: contact.id, sender: 'counsellor', body: `Update on ${spec.first}'s applications — progressing well.`, template: 'progress_update', read_at: daysAgo(6), created_at: daysAgo(7) },
        { contact_id: contact.id, sender: 'parent', body: 'Thank you for the update!', template: null, read_at: null, created_at: daysAgo(5) },
      ]);
    }
  }

  // documents tracker (varied statuses)
  const docDefs = [
    { document_name: 'Academic transcript', doc_type: 'transcript', status: 'received' },
    { document_name: 'Teacher reference', doc_type: 'recommendation', status: idx % 3 === 0 ? 'pending' : 'received' },
    { document_name: 'Personal statement', doc_type: 'essay', status: idx % 4 === 0 ? 'overdue' : 'pending' },
  ];
  await db(supabase).from('student_documents').insert(
    docDefs.map((d) => ({
      student_profile_id: id,
      document_name: d.document_name,
      doc_type: d.doc_type,
      status: d.status,
      uploaded_at: d.status === 'received' ? daysAgo(10 + (idx % 20)) : null,
      due_date: d.status !== 'received' ? isoDate(daysFromNow(d.status === 'overdue' ? -3 : 14)) : null,
      notes: null,
    }))
  );

  // Back-date ALL activity timestamps for "stalled" students so lastActive is
  // genuinely stale. The adapter's lastActive = max(updated_at across personal/
  // academic/lifestyle/applications, created_at across notes) — every one must be
  // old or the max stays fresh and the stalled alert never fires.
  if (spec.stalled) {
    const stale = daysAgo(22 + (idx % 10));
    await Promise.all([
      db(supabase).from('student_personal_information').update({ updated_at: stale }).eq('profile_id', id),
      db(supabase).from('student_academic_input').update({ updated_at: stale }).eq('profile_id', id),
      db(supabase).from('student_lifestyle_preference').update({ updated_at: stale }).eq('profile_id', id),
      db(supabase).from('applications').update({ updated_at: stale }).eq('profile_id', id),
      db(supabase).from('counsellor_notes').update({ created_at: stale }).eq('student_profile_id', id),
    ]);
  }

  return id;
};

// ── teardown ───────────────────────────────────────────────────────────────

const listSeedUsers = async (supabase: Client): Promise<Array<{ id: string; email: string }>> => {
  const out: Array<{ id: string; email: string }> = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await (supabase as any).auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const users = data?.users ?? [];
    for (const u of users) {
      if ((u.email ?? '').endsWith(SEED_EMAIL_SUFFIX)) out.push({ id: u.id, email: u.email });
    }
    if (users.length < 200) break;
  }
  return out;
};

const teardown = async (supabase: Client) => {
  const users = await listSeedUsers(supabase);
  console.log(`Teardown: removing ${users.length} seeded student(s)…`);
  for (const u of users) {
    // application_checklist has no guaranteed cascade from applications → delete explicitly first
    const { data: apps } = await db(supabase).from('applications').select('id').eq('profile_id', u.id);
    const appIds = ((apps ?? []) as any[]).map((a) => a.id);
    if (appIds.length > 0) await db(supabase).from('application_checklist').delete().in('application_id', appIds);
    // delete profile → cascades student_*, applications, student_matches, counsellor_notes,
    // parent_contacts → parent_messages, student_documents (all FK on delete cascade)
    await db(supabase).from('profiles').delete().eq('id', u.id);
    await (supabase as any).auth.admin.deleteUser(u.id);
  }
  // Catalogue deadlines aren't FK'd to profiles, so remove seed-marked rows separately.
  const { error: dErr } = await db(supabase).from('deadlines').delete().in('intake', SEED_DEADLINE_INTAKES);
  if (dErr) console.warn('  ! could not clean seed deadlines:', dErr.message);
};

// ── preflight + main ─────────────────────────────────────────────────────────

const preflight = async (supabase: Client) => {
  const { count, error } = await supabase.from('programs').select('id', { count: 'exact', head: true });
  if (error) throw new Error(`Cannot read programs: ${error.message}`);
  if (!count || count === 0) throw new Error('programs catalogue is empty — seed must target the populated remote DB.');
  // verify the phase-A migration applied (decision column on applications)
  const { error: colErr } = await db(supabase).from('applications').select('decision').limit(1);
  if (colErr) throw new Error(`applications.decision missing — apply migration 20260628120000 first (${colErr.message}).`);
  console.log(`Preflight OK: ${count} programs in catalogue; applications.decision present.`);
};

const main = async () => {
  const args = process.argv.slice(2);
  const countArg = args.find((a) => a.startsWith('--count='));
  const count = countArg ? Math.max(1, Math.min(100, parseInt(countArg.split('=')[1], 10))) : 25;
  const supabase = createServiceRoleSupabaseClient() as unknown as Client;

  await teardown(supabase); // always idempotent-clean first
  if (args.includes('--teardown')) { console.log('Teardown complete.'); return; }

  await preflight(supabase);

  const specs = buildSpecs(count);
  console.log(`Seeding ${specs.length} students…`);
  const deadlinePrograms = new Set<string>(); // one deadline row per programme across the run
  let ok = 0;
  for (let i = 0; i < specs.length; i++) {
    const id = await seedStudent(supabase, specs[i], i, deadlinePrograms);
    if (id) { ok++; console.log(`  ✓ ${specs[i].first} ${specs[i].last} (${specs[i].programme}, ${specs[i].cluster})`); }
  }
  console.log(`\nDone: ${ok}/${specs.length} students seeded.`);
};

main().catch((err) => {
  console.error('Seed failed:', err?.message ?? err);
  process.exit(1);
});
