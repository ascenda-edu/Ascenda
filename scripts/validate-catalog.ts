import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const loadLocalEnv = () => {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const contents = fs.readFileSync(envPath, 'utf-8');
  contents.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...rest] = trimmed.split('=');
    if (!key || rest.length === 0) return;
    if (process.env[key]) return;
    process.env[key] = rest.join('=').replace(/^"|"$/g, '');
  });
};

const getClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.');
  }
  return createClient(supabaseUrl, serviceRole);
};

const getCount = async (supabase: ReturnType<typeof getClient>, table: string, filter?: (q: any) => any) => {
  let query = supabase.from(table).select('id', { count: 'exact', head: true });
  if (filter) query = filter(query);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
};

const getMinMax = async (
  supabase: ReturnType<typeof getClient>,
  column: string
): Promise<{ min: number | null; max: number | null }> => {
  const minQuery = await supabase
    .from('course_scoring_v1')
    .select(column)
    .not(column, 'is', null)
    .order(column, { ascending: true })
    .limit(1);
  if (minQuery.error) throw minQuery.error;

  const maxQuery = await supabase
    .from('course_scoring_v1')
    .select(column)
    .not(column, 'is', null)
    .order(column, { ascending: false })
    .limit(1);
  if (maxQuery.error) throw maxQuery.error;

  const minVal = (minQuery.data?.[0] as any)?.[column] ?? null;
  const maxVal = (maxQuery.data?.[0] as any)?.[column] ?? null;
  return {
    min: typeof minVal === 'number' ? minVal : Number(minVal) || null,
    max: typeof maxVal === 'number' ? maxVal : Number(maxVal) || null
  };
};

const logStat = (label: string, value: unknown) => {
  console.log(`${label}:`, value);
};

const main = async () => {
  loadLocalEnv();
  const supabase = getClient();

  const programsCount = await getCount(supabase, 'programs');
  const universitiesCount = await getCount(supabase, 'universities');
  const citiesCount = await getCount(supabase, 'cities');
  const viewCount = await getCount(supabase, 'course_scoring_v1');

  logStat('Programs', programsCount);
  logStat('Universities', universitiesCount);
  logStat('Cities', citiesCount);
  logStat('Course scoring rows', viewCount);

  const missingUniversity = await getCount(supabase, 'programs', (q) => q.is('university_id', null));
  logStat('Programs missing university_id', missingUniversity);

  try {
    const orphanedCity = await getCount(supabase, 'universities', (q) =>
      q.select('id,city_id,cities!left(id)', { count: 'exact', head: true })
        .not('city_id', 'is', null)
        .is('cities.id', null)
    );
    logStat('Universities with non-matching city_id', orphanedCity);
  } catch {
    console.warn('City FK check skipped (join filter not supported).');
  }

  const missingCourseName = await getCount(supabase, 'programs', (q) => q.is('course_name', null));
  const missingIb = await getCount(supabase, 'programs', (q) => q.is('min_ib_score', null));
  const missingALevel = await getCount(supabase, 'programs', (q) => q.is('min_a_level_score', null));
  const missingTuition = await getCount(supabase, 'programs', (q) => q.is('yearly_international_tuition_fee_gbp', null));

  logStat('Programs missing course_name', missingCourseName);
  logStat('Programs missing min_ib_score', missingIb);
  logStat('Programs missing min_a_level_score', missingALevel);
  logStat('Programs missing yearly_international_tuition_fee_gbp', missingTuition);

  const uniScore = await getMinMax(supabase, 'university_score');
  const selectivityScore = await getMinMax(supabase, 'course_selectivity_score');
  const totalScore = await getMinMax(supabase, 'total_course_score');

  logStat('University score range', uniScore);
  logStat('Selectivity score range', selectivityScore);
  logStat('Total score range', totalScore);

  const errors: string[] = [];
  if (programsCount === 0) errors.push('No programs found.');
  if (universitiesCount === 0) errors.push('No universities found.');
  if (viewCount !== programsCount) errors.push('course_scoring_v1 count does not match programs count.');
  if (missingUniversity > 0) errors.push('Programs missing university_id.');

  if (errors.length) {
    console.error('Validation failed:');
    errors.forEach((err) => console.error(`- ${err}`));
    process.exit(1);
  }

  console.log('Validation complete.');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
