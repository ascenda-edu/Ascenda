import fs from 'fs';
import path from 'path';
// @ts-ignore papaparse lacks types here
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

const uniqueByKey = (rows: Row[], key: string): Row[] => {
  const map = new Map<string, Row>();
  rows.forEach((row) => {
    const value = row[key];
    if (typeof value === 'string') {
      if (!map.has(value)) map.set(value, row);
    }
  });
  return Array.from(map.values());
};

const readCsv = (filePath: string): Row[] => {
  const contents = fs.readFileSync(filePath, 'utf-8');
  const parsed = Papa.parse(contents, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    const message = parsed.errors.map((e: any) => `${e.message} at row ${e.row}`).join('; ');
    throw new Error(`CSV parse errors in ${filePath}: ${message}`);
  }
  const numericFields = new Set([
    'rank_overall',
    'intl_tuition_low',
    'intl_tuition_high',
    'acceptance_rate',
    'acceptance_rate_pct',
    'nss_score_pct',
    'intake_size',
    'gender_ratio_pct',
    'international_students_ratio_pct',
    'student_to_staff_ratio',
    'student_dorm_cost_gbp_per_year',
    'average_rent_outside_campus_gbp_per_month',
    'graduate_employment_rate_pct',
    'average_starting_salary_gbp',
    'number_of_students',
    'min_ib_score',
    'a_level_min_numeric',
    'yearly_international_tuition_fee_gbp'
  ]);

  const parseNumeric = (value: string): number | null => {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return parsed.data
    .map((row: Row) => {
      const normalized: Row = {};
      Object.entries(row).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '') return;
        if (typeof value === 'string') {
          const trimmed = value.trim();
          const first = trimmed[0];
          const last = trimmed[trimmed.length - 1];
          if (
            trimmed.length > 1 &&
            ((first === '{' && last === '}') || (first === '[' && last === ']'))
          ) {
            try {
              normalized[key] = JSON.parse(trimmed);
              return;
            } catch {
              // keep as string
            }
          }
          if (numericFields.has(key)) {
            const parsedNumber = parseNumeric(trimmed);
            if (parsedNumber !== null) {
              normalized[key] = parsedNumber;
              return;
            }
          }
          normalized[key] = trimmed;
          return;
        }
        normalized[key] = value;
      });
      if (normalized.name && !normalized.course_name) {
        normalized.course_name = normalized.name;
      }
      if (normalized.course_name && !normalized.name) {
        normalized.name = normalized.course_name;
      }
      return normalized;
    })
    .filter((row: Row) => Object.keys(row).length > 0);
};

const upsertTable = async (table: string, rows: Row[], onConflict: string) => {
  if (!rows.length) return;
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  const supabase = createClient(supabaseUrl, serviceRole);
  for (const batch of chunk(rows, 500)) {
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw error;
  }
};

const main = async () => {
  const dirFlagIndex = process.argv.indexOf('--dir');
  const dir = dirFlagIndex !== -1 ? process.argv[dirFlagIndex + 1] : 'supabase/imports';

  const universities = readCsv(path.join(dir, 'universities.csv')).map((row) => {
    const clone = { ...row };
    delete (clone as any).course_name;
    return clone;
  });
  // programs.csv is no longer tracked (see .gitignore — import CSVs are untracked;
  // it was removed in `chore: drop supabase/imports/programs.csv from the repo`).
  // Without this guard `readCsv` dies on a bare ENOENT that says nothing about how
  // to get the file back. The sibling upload-all-countries.ts already guards this way.
  const programsPath = path.join(dir, 'programs.csv');
  if (!fs.existsSync(programsPath)) {
    console.error(
      `Required file not found: ${programsPath}\n` +
        `It is deliberately untracked. Either pass --dir <folder> pointing at a local copy, ` +
        `or restore it with: git revert e199f41 && git lfs pull`
    );
    process.exit(1);
  }

  const programs = uniqueByKey(readCsv(programsPath), 'id');
  const requirements = uniqueByKey(readCsv(path.join(dir, 'program_requirements.csv')), 'program_id');

  console.log(`Upserting ${universities.length} universities...`);
  await upsertTable('universities', universities, 'id');

  console.log(`Upserting ${programs.length} programs...`);
  await upsertTable('programs', programs, 'id');

  console.log(`Upserting ${requirements.length} program requirements...`);
  await upsertTable('program_requirements', requirements, 'program_id');

  console.log('Import complete.');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
