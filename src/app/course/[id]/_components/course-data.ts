import { CalendarDays, GraduationCap, Landmark, ShieldCheck, Wallet } from 'lucide-react';
import type { CourseView, Outcomes, OpenDayEvent, QuickFact, Requirement } from './types';

/* ─── Formatting ─────────────────────────────────────────────────────────── */

export const normalizeLocation = (city?: string | null, region?: string | null, country?: string | null) =>
  [city, region, country].filter(Boolean).join(', ') || 'Location unavailable';

/**
 * If a currency-like field arrives as a bare number ("9250" / "45000"), add
 * thousand separators and a currency prefix. Strings that already contain a
 * currency symbol or non-numeric chars are returned as-is.
 */
export const formatCurrencyString = (
  value?: string | number | null,
  currency?: string | null
): string | null => {
  if (value === null || value === undefined) return null;
  const stringVal = String(value).trim();
  if (!stringVal) return null;

  const hasSymbol = /[£$€¥]/.test(stringVal);
  if (hasSymbol) return stringVal;

  const symbol = currency?.toUpperCase() === 'USD'
    ? '$'
    : currency?.toUpperCase() === 'EUR'
      ? '€'
      : currency?.toUpperCase() === 'GBP'
        ? '£'
        : '£';

  if (/^\d+(\.\d+)?$/.test(stringVal)) {
    return `${symbol}${Number(stringVal).toLocaleString('en-GB')}`;
  }

  return stringVal;
};

/* ─── Text parsing ───────────────────────────────────────────────────────── */

export const parseTextBlocks = (text?: string | null) => {
  if (!text) return { intro: [] as string[], bullets: [] as string[] };
  const normalized = text.replace(/\r/g, '').trim();
  if (!normalized) return { intro: [], bullets: [] };

  const parts = normalized.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return { intro: [normalized], bullets: [] };
  }
  const [first, ...rest] = parts;
  return { intro: [first], bullets: rest };
};

export const splitSentences = (text: string) => {
  // 1. Split by explicit delimiters first (bullets, numbered lists)
  const lines = text
    .split(/(?:^|\n)\s*(?:[•\-*]|\d+\.)\s+/m)
    .map((s) => s.trim())
    .filter(Boolean);

  if (lines.length > 1) return lines;

  // 2. If no bullets, try splitting by semicolons if there are multiple
  if (text.includes(';')) {
    const parts = text.split(';').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) return parts;
  }

  // 3. Fallback: Split by sentence endings, but keep them together if short.
  // This regex looks for [.!?] followed by space and a capital letter.
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
};

export const extractBulletItems = (text?: string | null) => {
  const { intro, bullets } = parseTextBlocks(text);
  if (bullets.length) return bullets;
  if (intro.length > 1) return intro;
  if (text) return splitSentences(text);
  return [];
};

export type ModuleYearSection = { title: string; yearNum: number | null; items: string[] };

export const extractYearSections = (
  modules?: string | null,
  durationText?: string | null
): ModuleYearSection[] => {
  if (!modules) return [];
  const normalized = modules.replace(/\r/g, '\n').trim(); // Keep newlines for structure
  if (!normalized) return [];

  // Regex to find "Year X" or "Stage X" headers. We look for "Year" followed by
  // a number, optionally followed by a colon or newline. Use word boundary \b to
  // match "Year 1" even if inline without punctuation.
  const yearPattern = /\b(?:Year|Stage)\s*(\d+)(?:\s*[:\-])?/gi;

  const sections: { title: string; items: string[] }[] = [];
  let match: RegExpExecArray | null;
  const indices: { title: string; start: number; endHeader: number }[] = [];

  while ((match = yearPattern.exec(normalized)) !== null) {
    indices.push({
      title: `Year ${match[1]}`,
      start: match.index,
      endHeader: match.index + match[0].length
    });
  }

  if (!indices.length) {
    // No explicit years found, treat whole text as one block (or try to parse list)
    const items = splitSentences(normalized);
    return items.length ? [{ title: 'Modules', items, yearNum: null }] : [];
  }

  indices.forEach((entry, idx) => {
    // Content starts after the header, ends at the next header or end of string.
    const contentStart = entry.endHeader;
    const contentEnd = idx + 1 < indices.length ? indices[idx + 1].start : normalized.length;

    let content = normalized.slice(contentStart, contentEnd).trim();

    // Clean up leading punctuation often left after "Year 1:"
    content = content.replace(/^[:\-\s]+/, '');

    if (!content) return;

    const items = splitSentences(content);
    if (items.length) {
      sections.push({ title: entry.title, items });
    }
  });

  // Merge duplicate years
  const mergedByYear = new Map<number, string[]>();
  const extras: { title: string; items: string[] }[] = [];

  const getYearNum = (t: string) => parseInt(t.replace(/\D/g, ''), 10);

  sections.forEach((section) => {
    const yr = getYearNum(section.title);
    if (!isNaN(yr)) {
      const existing = mergedByYear.get(yr) ?? [];
      mergedByYear.set(yr, [...existing, ...section.items]);
    } else {
      extras.push(section);
    }
  });

  const mergedSections: ModuleYearSection[] = [
    ...Array.from(mergedByYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([yearNum, items]) => ({
        title: `Year ${yearNum}`,
        yearNum,
        items: Array.from(new Set(items)) // Dedupe items
      })),
    ...extras.map((s) => ({ ...s, yearNum: null }))
  ];

  // Filter out years beyond the stated duration.
  const parseDurationCount = (text?: string | null) => {
    if (!text) return null;
    const m = text.match(/(\d+(?:\.\d+)?)/);
    return m ? Math.round(parseFloat(m[1])) : null;
  };

  const maxYears = parseDurationCount(durationText);
  if (maxYears) {
    return mergedSections
      .filter((section) => section.yearNum === null || section.yearNum <= maxYears)
      .sort((a, b) => {
        if (a.yearNum === null || b.yearNum === null) return 0;
        return a.yearNum - b.yearNum;
      });
  }

  return mergedSections;
};

/* ─── Derived fields ─────────────────────────────────────────────────────── */

export const buildRequirements = (raw: Record<string, any>): Requirement[] => {
  if (!raw) return [];
  const reqs: Requirement[] = [];
  if (raw.min_ib) reqs.push({ label: 'IB minimum', value: `${raw.min_ib}` });
  if (raw.min_alevel) reqs.push({ label: 'A-Levels', value: raw.min_alevel });
  if (raw.ucas_points) reqs.push({ label: 'UCAS points', value: raw.ucas_points });
  if (raw.subject_requirements) reqs.push({ label: 'Subjects', value: raw.subject_requirements });
  if (raw.entry_requirements_overview) reqs.push({ label: 'Overview', value: raw.entry_requirements_overview });
  if (raw.additional_entry_requirements) reqs.push({ label: 'Additional', value: raw.additional_entry_requirements });
  if (raw.english_requirements) reqs.push({ label: 'English', value: raw.english_requirements });
  if (raw.contextual_admissions) reqs.push({ label: 'Contextual admissions', value: raw.contextual_admissions });
  const courseReqs = raw.course_requirements ?? raw.metadata?.course_requirements;
  if (courseReqs) reqs.push({ label: 'Course requirements', value: String(courseReqs) });
  return reqs;
};

/** Requirement labels that render as short headline metrics rather than prose. */
export const HEADLINE_REQUIREMENT_LABELS = ['IB minimum', 'A-Levels', 'UCAS points'];

export const buildOutcomes = (raw: Record<string, any>): Outcomes | null => {
  const satisfaction = raw.student_satisfaction ?? null;
  const employment = raw.employment_after_course ?? null;
  const outcomes = raw.student_outcomes ?? null;
  const salary = raw.average_salary_after_15m ?? null;

  if (!satisfaction && !employment && !outcomes && !salary) return null;

  return { satisfaction, employment, outcomes, salary };
};

export const parseOpenDays = (raw?: string | null): OpenDayEvent[] => {
  if (!raw) return [];
  return raw
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((entry) => {
      // Example: "25 Nov - Title [url]"
      const match = entry.match(/^(.*?)\s*-\s*(.*?)(?:\s*\[(https?:[^\]]+)\])?$/);
      if (match) {
        const [, datePart, titlePart, url] = match;
        return { label: `${datePart.trim()} — ${titlePart.trim()}`, url: url ?? null };
      }
      return { label: entry };
    });
};

export const buildQuickFacts = (course: CourseView): QuickFact[] => {
  const facts: QuickFact[] = [];
  if (course.level) facts.push({ label: 'Level', value: course.level, icon: GraduationCap });
  if (course.duration) facts.push({ label: 'Duration', value: course.duration, icon: CalendarDays });
  if (course.campus) facts.push({ label: 'Campus', value: course.campus, icon: Landmark });
  const tuitionDisplay = formatCurrencyString(course.tuition, course.currency) ?? 'Contact university';
  const startRaw = course.startDate?.trim() ?? '';
  const intakeRaw = course.intake?.trim() ?? '';
  const intakeDisplay = intakeRaw.length > 0 ? intakeRaw : 'TBD';
  const showStart = startRaw.length > 0 && startRaw.toLowerCase() !== intakeRaw.toLowerCase();
  const startDisplay = showStart ? startRaw : '';
  facts.push({ label: course.domesticTuition ? 'Intl. Tuition' : 'Tuition', value: tuitionDisplay, icon: Wallet });
  if (course.domesticTuition) {
    const domesticDisplay = formatCurrencyString(course.domesticTuition, course.currency) ?? '';
    if (domesticDisplay) facts.push({ label: 'Home Tuition', value: domesticDisplay, icon: Wallet });
  }
  facts.push({ label: 'Intake', value: intakeDisplay, icon: CalendarDays });
  if (showStart) {
    facts.push({ label: 'Start date', value: startDisplay, icon: CalendarDays });
  }
  if (course.ucasCode) facts.push({ label: 'UCAS code', value: course.ucasCode, icon: ShieldCheck });
  return facts;
};

/* ─── Fallback copy (used when the catalogue row has no prose) ───────────── */

export const buildFallbackSummary = (
  courseName?: string | null,
  university?: string | null,
  level?: string | null,
  location?: string | null
): string => {
  const subject = courseName?.trim() || 'this programme';
  const programmeLevel = level?.trim()?.toLowerCase() || 'undergraduate';
  const uniName = university?.trim() || 'the university';
  const place = location?.trim();

  const intro = `**${subject}** at ${uniName}${place ? ` in ${place}` : ''} is a ${programmeLevel} programme designed to give you both rigorous academic grounding and exposure to current practice in the field.`;
  const bullets = [
    `Study with academics who are active researchers and industry practitioners, with regular contact through seminars, tutorials, and project work.`,
    `Develop core knowledge in your first year before specialising through optional modules in later years tailored to your interests and career goals.`,
    `Build practical, transferable skills — analysis, communication, teamwork, and project delivery — that employers across sectors actively look for.`,
    `Access dedicated employability support including internships, placements, alumni mentoring, and a careers service that connects students to graduate roles.`,
    `Join a global student community with extracurricular societies, sports, volunteering, and study-abroad opportunities to round out your university experience.`
  ];
  return `${intro} - ${bullets.join(' - ')}`;
};

export const buildFallbackModules = (courseName?: string | null): string => {
  const subject = courseName?.trim() || 'core subject';
  return [
    `Year 1: Foundations of ${subject}; Academic and Research Skills; Quantitative Methods; Introduction to Theory and Practice; Optional language or breadth module.`,
    `Year 2: Intermediate ${subject} topics; Applied Methods and Tools; Group Project; Two optional pathway modules; Career and Industry Insights.`,
    `Year 3: Advanced ${subject}; Independent Dissertation or Capstone Project; Two specialist optional modules aligned with your interests; Employability and Professional Development.`
  ].join(' ');
};

export const buildFallbackAssessment = (): string =>
  'Assessment is varied across the programme and may include: Written examinations across foundational modules; Coursework essays and analytical reports; Group and individual projects with presentations; Practical lab, studio, or fieldwork assessments where relevant; A final-year dissertation or capstone project that lets you specialise in a topic of your choice.';

/* ─── Row → view model ───────────────────────────────────────────────────── */

/**
 * Pure. Was a `useCallback` with an empty dependency array inside the page
 * component, which is the same thing written as a hook.
 */
export const mapRawData = (rawData: Record<string, any>, uni: Record<string, any>): CourseView => {
  const uniMeta = uni && typeof uni.metadata === 'object' && uni.metadata !== null ? (uni.metadata as Record<string, unknown>) : {};
  const programMeta = rawData.metadata && typeof rawData.metadata === 'object' ? (rawData.metadata as Record<string, unknown>) : {};
  const logoUrl = typeof uniMeta.logo_url === 'string' ? (uniMeta.logo_url as string) : typeof uniMeta.logoUrl === 'string' ? (uniMeta.logoUrl as string) : undefined;
  const location = normalizeLocation(uni.city, uni.region, uni.country);
  const duration = rawData.duration || null;
  const intake = rawData.start_date || null;
  const tuitionValue = rawData.yearly_international_tuition_fee_gbp ?? rawData.tuition ?? (rawData.tuition_fees_international ? String(rawData.tuition_fees_international) : null) ?? (rawData.tuition_fees_home ? String(rawData.tuition_fees_home) : null) ?? null;
  const tuition = tuitionValue !== null && tuitionValue !== undefined ? (typeof tuitionValue === 'number' ? tuitionValue.toString() : tuitionValue) : null;
  const mapped: CourseView = {
    id: rawData.id, title: rawData.course_name, university: uni.name ?? 'University', logoUrl: logoUrl ?? null,
    location, level: rawData.study_level ?? null, duration, intake, campus: rawData.campus ?? null, tuition,
    domesticTuition: rawData.yearly_international_tuition_fee_gbp != null && rawData.tuition != null ? rawData.tuition : null,
    ucasCode: rawData.ucas_code ?? null, startDate: rawData.start_date ?? null,
    summary: rawData.course_summary && String(rawData.course_summary).trim().length > 0 ? rawData.course_summary : buildFallbackSummary(rawData.course_name, uni.name, rawData.study_level, location),
    modules: rawData.modules && String(rawData.modules).trim().length > 0 ? rawData.modules : buildFallbackModules(rawData.course_name),
    assessment: rawData.assessment_methods && String(rawData.assessment_methods).trim().length > 0 ? rawData.assessment_methods : buildFallbackAssessment(),
    requirements: buildRequirements(rawData), quickFacts: [], courseUrl: rawData.provider_course_url ?? null, applyUrl: rawData.provider_apply_url ?? null,
    outcomes: buildOutcomes(rawData), openDays: parseOpenDays(rawData.open_days),
    courseRequirements: rawData.course_requirements ?? (programMeta.course_requirements as string | undefined) ?? null,
    // These four resolve from `metadata` ONLY. The matching programs.* columns do
    // not exist on the live table — verified against the database, which answers
    // 42703 "column does not exist" for all four — so the `rawData.X ??` branch they
    // used to lead with was dead on every render. Don't add them to PROGRAMS_SELECT
    // either: PostgREST 400s the whole query for an unknown column, which would take
    // the entire course page down.
    careerOutcomesOverview: (programMeta.career_outcomes_overview as string | undefined) ?? null,
    studentLifeOverview: (programMeta.student_life_overview as string | undefined) ?? null,
    studentLifeTags: (programMeta.student_life_tags as string | undefined) ?? null,
    costOverview: (programMeta.cost_overview as string | undefined) ?? null,
    universityLife: uni.university_life ?? null, culturalSocialEnvironment: uni.cultural_social_environment ?? null,
    cityLife: uni.city_life ?? null, climate: uni.climate ?? null, safety: uni.safety_index ?? null,
    transportAccessibility: uni.transport_accessibility ?? null, numberOfStudents: uni.number_of_students ?? null,
    studentToStaffRatio: uni.student_to_staff_ratio ?? null, nssPct: uni.nss_score_pct ?? null,
    internationalStudentsPct: uni.international_students_ratio_pct ?? null,
    placementYear: rawData.placement_year ?? null, placementYearDetail: rawData.placement_year_detail ?? null,
    topIndustries: rawData.top_industries ?? null, graduateEmploymentRate: uni.graduate_employment_rate_pct ?? null,
    averageStartingSalary: rawData.average_starting_salary_gbp_override ?? uni.average_starting_salary_gbp ?? null,
    studyAbroadOption: rawData.study_abroad_option ?? null,
    studentDormCost: rawData.student_dorm_cost_gbp_per_year_override ?? null,
    averageRentOutsideCampus: rawData.average_rent_outside_campus_gbp_per_month_override ?? null,
    costOfLife: rawData.cost_of_life_override ?? (programMeta.cost_of_life as string | undefined) ?? null,
    monthlyHousingGbp: (programMeta.monthly_housing_gbp as number | undefined) ?? null,
    monthlyFoodGbp: (programMeta.monthly_food_gbp as number | undefined) ?? null,
    monthlyTransportGbp: (programMeta.monthly_transport_gbp as number | undefined) ?? null,
    monthlyTotalGbp: (programMeta.monthly_total_gbp as number | undefined) ?? null,
    annualLivingCostGbp: (programMeta.annual_living_cost_gbp as number | undefined) ?? null,
    currency: rawData.currency ?? uni.currency ?? null,
    // These two were selected in PROGRAMS_SELECT and read by the Costs panel's
    // "University Estimate" row, but never mapped here — so that row could never
    // render, for any programme. They live on the university, not the programme.
    intlTuitionLow: uni.intl_tuition_low ?? null,
    intlTuitionHigh: uni.intl_tuition_high ?? null,
    tuitionFeesInternational: rawData.tuition_fees_international ?? null,
    tuitionFeesHome: rawData.tuition_fees_home ?? null,
    yearlyIntlTuition: rawData.yearly_international_tuition_fee_gbp ?? null,
  };
  mapped.quickFacts = buildQuickFacts(mapped);
  return mapped;
};
