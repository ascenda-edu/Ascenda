import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { UniversityInformation, type UniversityData } from '@/components/university-search/university-information';
import { PAGE_BODY_IN_SHELL } from './_components/page-body';

export const metadata: Metadata = {
  title: 'University'
};

type PageProps = {
  params: Promise<{ id: string }>;
};

type ProgramRecord = {
  id: string;
  course_name: string;
  study_level?: string | null;
  duration?: string | null;
  start_date?: string | null;
  campus?: string | null;
  course_summary?: string | null;
  tuition_fees_international?: string | null;
  tuition_fees_home?: string | null;
  universities?: UniversityRecord;
};

type UniversityRecord = {
  id: string;
  name: string;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  rank_overall?: number | null;
  rank_source?: string | null;
  website?: string | null;
  intl_tuition_low?: number | null;
  intl_tuition_high?: number | null;
  currency?: string | null;
  acceptance_rate?: number | null;
  metadata?: Record<string, any> | null;
};

const normalizeLocation = (university?: UniversityRecord | null) => {
  if (!university) return null;
  const parts = [university.city, university.region, university.country].filter(Boolean);
  return parts.join(', ') || null;
};

const normalizeDuration = (program?: ProgramRecord | null) => {
  if (!program) return null;
  return program.duration ?? null;
};

const normalizePercent = (value?: number | null) => {
  if (value === null || value === undefined) return null;
  return value <= 1 ? value * 100 : value;
};

const mapToUniversityData = (program?: ProgramRecord | null, university?: UniversityRecord | null): UniversityData => {
  const uniMeta = (university?.metadata ?? {}) as Record<string, any>;
  const rankingsMeta = (uniMeta.rankings ?? {}) as Record<string, any>;
  const fitFactorsMeta = (uniMeta.fitFactors ?? {}) as Record<string, any>;

  return {
    program: {
      title: program?.course_name ?? null,
      level: program?.study_level ?? null,
      duration: normalizeDuration(program),
      size: null
    },
    university: {
      name: university?.name ?? null,
      location: normalizeLocation(university),
      totalStudents: uniMeta.totalStudents ?? uniMeta.total_students ?? null,
      genderRatio: uniMeta.genderRatio ?? uniMeta.gender_ratio ?? null,
      internationalStudentRatio: uniMeta.internationalStudentRatio ?? uniMeta.international_student_ratio ?? null,
      studentStaffRatio: uniMeta.studentStaffRatio ?? uniMeta.student_staff_ratio ?? null,
      type: uniMeta.type ?? uniMeta.category ?? null,
      studyAbroadAvailable: uniMeta.studyAbroadAvailable ?? null
    },
    rankings: {
      guardian: rankingsMeta.guardian ?? uniMeta.guardian ?? university?.rank_overall ?? null,
      qs: rankingsMeta.qs ?? (university?.rank_source?.toLowerCase() === 'qs' ? university.rank_overall : null),
      times: rankingsMeta.times ?? (university?.rank_source?.toLowerCase() === 'times' ? university.rank_overall : null)
    },
    statistics: {
      acceptanceRate: normalizePercent(university?.acceptance_rate ?? uniMeta.acceptanceRate ?? null),
      nssScore: normalizePercent(uniMeta.nssScore ?? null),
      employmentRate: normalizePercent(uniMeta.employmentRate ?? null)
    },
    costs: {
      annualTuition: program?.tuition_fees_international ?? university?.intl_tuition_low ?? null,
      dormitoryCost: uniMeta.dormitoryCost ?? null,
      averageRent: uniMeta.averageRent ?? null,
      livingIndex: uniMeta.livingIndex ?? null
    },
    experience: {
      culturalEnvironment: uniMeta.culturalEnvironment ?? null,
      socialLife: uniMeta.socialLife ?? null,
      climate: uniMeta.climate ?? null,
      safetyIndex: uniMeta.safetyIndex ?? null,
      airportDistance: uniMeta.airportDistance ?? null,
      trainStationDistance: uniMeta.trainStationDistance ?? null,
      cityCharacteristics: uniMeta.cityCharacteristics ?? null
    },
    fitFactors: {
      insights: fitFactorsMeta.insights ?? null,
      cityDescription: fitFactorsMeta.cityDescription ?? uniMeta.cityDescription ?? null
    }
  };
};

export default async function UniversityDetailPage(props: PageProps & { searchParams: Promise<{ from?: string }> }) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const supabase = await createServerSupabaseClient();
  const { data: programRecord, error } = await supabase.from('programs').select('*, universities(*)').eq('id', params.id).maybeSingle();
  const contextSource = searchParams.from === 'course' ? 'course' : searchParams.from === 'search' ? 'search' : 'direct';

  if (programRecord) {
    const universityData = mapToUniversityData(programRecord as ProgramRecord, (programRecord as ProgramRecord).universities ?? null);
    return (
      <UniversityInformation
        universityData={universityData}
        programId={params.id}
        contextSource={contextSource}
        className={PAGE_BODY_IN_SHELL}
      />
    );
  }

  if (error) {
    return (
      <UniversityInformation
        error="Unable to load this university right now. Please try again or pick another result."
        className={PAGE_BODY_IN_SHELL}
      />
    );
  }

  notFound();
}
