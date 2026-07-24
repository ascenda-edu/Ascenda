'use client';

import { useCallback, useEffect, useMemo, useState, type ElementType } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSearchParamState } from '@/lib/hooks/use-search-param-state';
import { ArrowLeft, BookOpen, CalendarDays, CheckCircle2, Dot, GraduationCap, Landmark, Layers, ListChecks, Loader2, MapPin, ShieldCheck, Wallet } from 'lucide-react';
import { Navbar } from '@/components/layout/navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import React from 'react';

export type CourseRawData = {
  programData: Record<string, any>;
  universityData: Record<string, any>;
};

type Requirement = { label: string; value: string };
type QuickFact = { label: string; value: string; icon: ElementType };
type Outcomes = {
  satisfaction?: string | null;
  employment?: string | null;
  outcomes?: string | null;
  salary?: string | null;
};
type OpenDayEvent = { label: string; url?: string | null };

type CourseView = {
  id: string;
  title: string;
  university: string;
  location: string;
  logoUrl?: string | null;
  level?: string | null;
  duration?: string | null;
  intake?: string | null;
  campus?: string | null;
  tuition?: string | number | null;
  domesticTuition?: string | number | null;
  currency?: string | null;
  tuitionFeesInternational?: string | null;
  tuitionFeesHome?: string | null;
  yearlyIntlTuition?: number | null;
  ucasCode?: string | null;
  startDate?: string | null;
  summary?: string | null;
  modules?: string | null;
  assessment?: string | null;
  requirements: Requirement[];
  quickFacts: QuickFact[];
  courseUrl?: string | null;
  applyUrl?: string | null;
  outcomes?: Outcomes | null;
  openDays?: OpenDayEvent[] | null;
  courseRequirements?: string | null;
  careerOutcomesOverview?: string | null;
  studentLifeOverview?: string | null;
  studentLifeTags?: string | null;
  costOverview?: string | null;
  // University life & campus
  universityLife?: string | null;
  culturalSocialEnvironment?: string | null;
  cityLife?: string | null;
  climate?: string | null;
  safety?: string | null;
  transportAccessibility?: string | null;
  numberOfStudents?: number | null;
  studentToStaffRatio?: number | null;
  nssPct?: number | null;
  internationalStudentsPct?: number | null;
  intlTuitionLow?: number | null;
  intlTuitionHigh?: number | null;
  // Career outcomes
  placementYear?: boolean | null;
  placementYearDetail?: string | null;
  topIndustries?: string | null;
  graduateEmploymentRate?: number | null;
  averageStartingSalary?: number | null;
  studyAbroadOption?: string | null;
  // Cost of living
  studentDormCost?: number | null;
  averageRentOutsideCampus?: number | null;
  costOfLife?: string | null;
  monthlyHousingGbp?: number | null;
  monthlyFoodGbp?: number | null;
  monthlyTransportGbp?: number | null;
  monthlyTotalGbp?: number | null;
  annualLivingCostGbp?: number | null;
};

const normalizeLocation = (city?: string | null, region?: string | null, country?: string | null) =>
  [city, region, country].filter(Boolean).join(', ') || 'Location unavailable';

const buildRequirements = (raw: Record<string, any>): Requirement[] => {
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

// If a currency-like field arrives as a bare number ("9250" / "45000"),
// add thousand separators and a currency prefix. Strings that already
// contain a currency symbol or non-numeric chars are returned as-is.
const formatCurrencyString = (
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

const buildFallbackSummary = (
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

const buildFallbackModules = (courseName?: string | null): string => {
  const subject = courseName?.trim() || 'core subject';
  return [
    `Year 1: Foundations of ${subject}; Academic and Research Skills; Quantitative Methods; Introduction to Theory and Practice; Optional language or breadth module.`,
    `Year 2: Intermediate ${subject} topics; Applied Methods and Tools; Group Project; Two optional pathway modules; Career and Industry Insights.`,
    `Year 3: Advanced ${subject}; Independent Dissertation or Capstone Project; Two specialist optional modules aligned with your interests; Employability and Professional Development.`
  ].join(' ');
};

const buildFallbackAssessment = (): string =>
  'Assessment is varied across the programme and may include: Written examinations across foundational modules; Coursework essays and analytical reports; Group and individual projects with presentations; Practical lab, studio, or fieldwork assessments where relevant; A final-year dissertation or capstone project that lets you specialise in a topic of your choice.';

const buildOutcomes = (raw: Record<string, any>): Outcomes | null => {
  const satisfaction = raw.student_satisfaction ?? null;
  const employment = raw.employment_after_course ?? null;
  const outcomes = raw.student_outcomes ?? null;
  const salary = raw.average_salary_after_15m ?? null;

  if (!satisfaction && !employment && !outcomes && !salary) return null;

  return { satisfaction, employment, outcomes, salary };
};

const parseOpenDays = (raw?: string | null): OpenDayEvent[] => {
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

const buildQuickFacts = (course: CourseView): QuickFact[] => {
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

const emphasize = (text: string) =>
  text.split(/(\*\*[^*]+\*\*)/g).map((chunk, idx) => {
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return (
        <strong key={`${chunk}-${idx}`}>
          {chunk.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={`${chunk}-${idx}`}>{chunk}</React.Fragment>;
  });

const parseTextBlocks = (text?: string | null) => {
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

const splitSentences = (text: string) => {
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

  // 3. Fallback: Split by sentence endings, but keep them together if short
  // This regex looks for [.!?] followed by space and a capital letter.
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter(Boolean);
};

const renderRichText = (text?: string | null, options?: { forceBullets?: boolean }) => {
  const { forceBullets = false } = options ?? {};
  const { intro, bullets } = parseTextBlocks(text);
  const fallbackSentences = forceBullets && text ? splitSentences(text.replace(/\r/g, '')) : [];
  const hasContent = intro.length || bullets.length || fallbackSentences.length;

  if (!hasContent) return <p className="text-muted-foreground">No information available.</p>;

  const finalBullets = bullets.length ? bullets : fallbackSentences;

  return (
    <div className="space-y-3">
      {intro.map((para, idx) => (
        <p key={`intro-${idx}`} className="text-foreground/85 leading-relaxed">
          {emphasize(para)}
        </p>
      ))}
      {finalBullets.length ? (
        <ul className="space-y-3 not-prose">
          {finalBullets.map((item, idx) => (
            <li key={`bullet-${idx}`} className="flex items-start gap-3">
              <span className="mt-2.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-primary/70" aria-hidden />
              <span className="text-foreground/85 leading-relaxed">{emphasize(item)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
};

const extractBulletItems = (text?: string | null) => {
  const { intro, bullets } = parseTextBlocks(text);
  if (bullets.length) return bullets;
  if (intro.length > 1) return intro;
  if (text) return splitSentences(text);
  return [];
};

const extractYearSections = (modules?: string | null, durationText?: string | null) => {
  if (!modules) return [];
  const normalized = modules.replace(/\r/g, '\n').trim(); // Keep newlines for structure
  if (!normalized) return [];

  // Regex to find "Year X" or "Stage X" headers
  // We look for "Year" followed by a number, optionally followed by a colon or newline
  // Use word boundary \b to match "Year 1" even if inline without punctuation
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
    // Content starts after the header
    const contentStart = entry.endHeader;
    // Content ends at the start of the next header, or end of string
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

  const mergedSections = [
    ...Array.from(mergedByYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([yearNum, items]) => ({
        title: `Year ${yearNum}`,
        yearNum,
        items: Array.from(new Set(items)) // Dedupe items
      })),
    ...extras.map(s => ({ ...s, yearNum: null }))
  ];

  // Logic to filter out years beyond duration (same as before)
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

const RequirementRenderer = ({ value }: { value: string }) => {
  // 1. Split Standard vs Contextual
  // Some descriptions combine both. We try to split them.
  const parts = value.split(/Typical Contextual Offer:|Contextual Offer:/i);
  const standard = parts[0].trim();
  const contextual = parts.length > 1 ? parts[1].trim() : null;

  const renderList = (text: string, title?: string) => {
    if (!text) return null;

    // Remove any leading "Typical Offer:" or similar prefixes if they exist redundantly
    const cleanText = text.replace(/^(Typical Offer:|Entry Requirements:)/i, '').trim();

    // Heuristic for splitting into a list:
    // 1. Semicolons are strong separators.
    // 2. If no semicolons, maybe split by sentences if it's long?
    // 3. Or if it contains bullet-like chars.

    let items: string[] = [];

    if (cleanText.includes(';')) {
      items = cleanText.split(';').map(s => s.trim()).filter(Boolean);
    } else if (cleanText.includes('•') || cleanText.includes('- ')) {
      items = cleanText.split(/[•-]/).map(s => s.trim()).filter(Boolean);
    } else {
      // Fallback: If it's a long paragraph (> 150 chars) with multiple sentences,
      // split by period to make it digestible.
      // But preserve "A.B." acronyms: Look for period followed by space and capital letter.
      if (cleanText.length > 150) {
        items = cleanText.split(/(?<=\.)\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
      } else {
        items = [cleanText];
      }
    }

    // Clean up items (remove trailing periods inside list items usually looks cleaner, or keep them)
    // We'll keep them to be safe.

    return (
      <div className="space-y-3">
        {title && (
          <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary/80">
            <span className="h-px w-4 bg-primary/40"></span>
            {title}
          </h4>
        )}

        {items.length === 1 ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {emphasize(items[0])}
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-1">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-3 rounded-lg border border-border/40 bg-muted/20 p-3 text-sm transition-colors hover:bg-muted/40">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" />
                <span className="text-foreground/90 leading-relaxed">{emphasize(item)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {renderList(standard)}
      {contextual && (
        <>
          {renderList(contextual, 'Contextual Offer')}
        </>
      )}
    </div>
  );
};

export function CoursePageClient({ params, initialData }: { params: { id: string }; initialData?: CourseRawData | null }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [course, setCourse] = useState<CourseView | null>(null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [showAllFlatModules, setShowAllFlatModules] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Record<string, boolean>>({});
  type ActionButton = {
    key: string;
    href: string;
    label: string;
    variant: 'outline' | 'default';
    className: string;
    priority: number;
  };

  const { backHref, backLabel } = useMemo(() => {
    const from = searchParams.get('from');
    if (from === 'search') return { backHref: '/university-search/search', backLabel: 'Back to results' };
    if (from === 'university') return { backHref: '/university-search/search', backLabel: 'Back to search' };
    if (from === 'quests') return { backHref: '/university-search/quests', backLabel: 'Back to quests' };
    return { backHref: '/dashboard', backLabel: 'Back' };
  }, [searchParams]);

  // When arriving from the search results, prefer a real history back-step so
  // the user lands on their exact filter context (scroll position, loaded
  // pages, facets) rather than a fresh, unfiltered results page. Fall back to
  // the results URL when there's no in-app history to return to (deep link).
  const fromSearch = searchParams.get('from') === 'search';
  const handleBackToResults = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/university-search/search');
    }
  }, [router]);

  const moduleItems = useMemo(() => extractBulletItems(course?.modules), [course?.modules]);
  const moduleYearSections = useMemo(
    () => extractYearSections(course?.modules, course?.duration),
    [course?.modules, course?.duration]
  );
  const visibleModules = showAllFlatModules ? moduleItems : moduleItems.slice(0, 8);
  const hasOutcomes = Boolean(course?.outcomes && (
    course.outcomes.satisfaction ||
    course.outcomes.employment ||
    course.outcomes.outcomes ||
    course.outcomes.salary
  ));
  const actionButtons = useMemo(() => {
    if (!course) return [];

    const buttons: ActionButton[] = [];

    if (course.applyUrl) {
      buttons.push({
        key: 'apply',
        href: course.applyUrl.trim(),
        label: 'Apply Now',
        variant: 'default',
        className: 'h-12 px-8 shadow-lg shadow-primary/20',
        priority: 3
      });
    }

    if (course.courseUrl) {
      buttons.push({
        key: 'visit',
        href: course.courseUrl.trim(),
        label: 'Visit Website',
        variant: 'outline',
        className: 'h-12 px-6',
        priority: 2
      });

      buttons.push({
        key: 'course',
        href: course.courseUrl.trim(),
        label: 'Course Site',
        variant: 'outline',
        className: 'h-12 px-8',
        priority: 1
      });
    }

    // Remove duplicate hrefs while keeping the highest priority label (Apply > Visit > Course)
    const seen = new Map<string, ActionButton>();
    buttons.forEach((btn) => {
      const existing = seen.get(btn.href);
      if (!existing || btn.priority > existing.priority) {
        seen.set(btn.href, btn);
      }
    });

    return Array.from(seen.values());
  }, [course]);

  const mapRawData = React.useCallback((rawData: Record<string, any>, uni: Record<string, any>): CourseView => {
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
      careerOutcomesOverview: rawData.career_outcomes_overview ?? (programMeta.career_outcomes_overview as string | undefined) ?? null,
      studentLifeOverview: rawData.student_life_overview ?? (programMeta.student_life_overview as string | undefined) ?? null,
      studentLifeTags: rawData.student_life_tags ?? (programMeta.student_life_tags as string | undefined) ?? null,
      costOverview: rawData.cost_overview ?? (programMeta.cost_overview as string | undefined) ?? null,
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
      tuitionFeesInternational: rawData.tuition_fees_international ?? null,
      tuitionFeesHome: rawData.tuition_fees_home ?? null,
      yearlyIntlTuition: rawData.yearly_international_tuition_fee_gbp ?? null,
    };
    mapped.quickFacts = buildQuickFacts(mapped);
    return mapped;
  }, []);

  useEffect(() => {
    if (initialData) {
      const mapped = mapRawData(initialData.programData, initialData.universityData);
      setCourse(mapped);
      return;
    }

    const fetchCourse = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = getBrowserSupabaseClient();
        const { data, error: supabaseError } = await supabase
          .from('programs')
          .select(
            `
            id,
            course_name,
            course_summary,
            study_level,
            duration,
            campus,
            ucas_code,
            start_date,
            modules,
            assessment_methods,
            provider_course_url,
            provider_apply_url,
            min_alevel,
            min_ib,
            ucas_points,
            subject_requirements,
            entry_requirements_overview,
            additional_entry_requirements,
            subsequent_year_entry_requirements,
            english_requirements,
            contextual_admissions,
            tuition_fees_international,
            tuition_fees_home,
            additional_fee_info,
            student_satisfaction,
            employment_after_course,
            student_outcomes,
            average_salary_after_15m,
            historic_entry_grades,
            open_days,
            cost_of_life_override,
            placement_year,
            placement_year_detail,
            top_industries,
            average_starting_salary_gbp_override,
            student_dorm_cost_gbp_per_year_override,
            average_rent_outside_campus_gbp_per_month_override,
            study_abroad_option,
            metadata,
            yearly_international_tuition_fee_gbp,
            tuition,
            currency,
            universities (
              name,
              city,
              region,
              country,
              metadata,
              university_life,
              cultural_social_environment,
              city_life,
              climate,
              safety_index,
              transport_accessibility,
              number_of_students,
              student_to_staff_ratio,
              nss_score_pct,
              international_students_ratio_pct,
              graduate_employment_rate_pct,
              average_starting_salary_gbp,
              intl_tuition_low,
              intl_tuition_high,
              currency
            )
          `
          )
          .eq('id', params.id)
          .maybeSingle();

        if (supabaseError) throw supabaseError;
        if (!data) {
          setError('Course not found.');
          return;
        }

        const rawData = data as Record<string, any>;
        const uni = rawData.universities ?? {};
        const mapped = mapRawData(rawData, uni);
        setCourse(mapped);
      } catch (err) {
        console.error('[CoursePageClient] fetch error:', err);
        const message = err instanceof Error
          ? err.message
          : (err as any)?.message ?? JSON.stringify(err) ?? 'Unable to load this course.';
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchCourse();
  }, [params.id, initialData, mapRawData]);

  const [activeTab, setActiveTab] = useSearchParamState('tab', 'overview');

  const costTuition = useMemo(() => {
    if (!course) return null;
    if (course.tuition) return course.tuition;
    if (course.yearlyIntlTuition) return String(course.yearlyIntlTuition);
    if (course.tuitionFeesInternational) return course.tuitionFeesInternational;
    if (course.tuitionFeesHome) return course.tuitionFeesHome;
    return null;
  }, [course]);

  const formattedCostTuition = costTuition
    ? formatCurrencyString(costTuition, course?.currency)
    : null;

  const formattedDomesticTuition = course?.domesticTuition
    ? formatCurrencyString(course.domesticTuition, course.currency)
    : null;

  const numericCostTuition = useMemo(() => {
    if (!costTuition) return 0;
    const parsed = Number(String(costTuition).replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }, [costTuition]);

  const totalCost = useMemo(() => {
    if (!course?.duration || !numericCostTuition) return null;
    const durationMatch = course.duration.match(/(\d+)/);
    if (!durationMatch) return null;
    const years = parseInt(durationMatch[1], 10);
    if (!years || years <= 0) return null;
    return numericCostTuition * years;
  }, [course?.duration, numericCostTuition]);

  const hasCostDetails = Boolean(
    costTuition ||
    course?.studentDormCost ||
    course?.averageRentOutsideCampus ||
    course?.costOfLife ||
    course?.intlTuitionLow ||
    course?.intlTuitionHigh ||
    course?.monthlyHousingGbp ||
    course?.monthlyFoodGbp ||
    course?.monthlyTotalGbp ||
    course?.annualLivingCostGbp ||
    course?.costOverview
  );

  const TABS = [
    { id: 'overview', label: 'Overview', icon: BookOpen },
    { id: 'curriculum', label: 'Curriculum', icon: Layers },
    { id: 'requirements', label: 'Requirements', icon: ListChecks },
    { id: 'assessment', label: 'Assessment', icon: ShieldCheck },
    { id: 'campus', label: 'Campus & City Life', icon: Landmark },
    { id: 'career', label: 'Career', icon: GraduationCap },
    { id: 'costs', label: 'Costs', icon: Wallet },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="pb-24">
        {/* Hero Section */}
        <div className="relative border-b border-border/40 bg-muted/10">
          <div className="absolute inset-0 bg-gradient-to-b from-background/5 to-background/60" />
          <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-10">
            <Breadcrumbs className="mb-8" />

            <div className="mb-8 flex items-center gap-3">
              {fromSearch ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-2 text-muted-foreground hover:text-foreground"
                  onClick={handleBackToResults}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {backLabel}
                </Button>
              ) : (
                <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
                  <Link href={backHref}>
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    {backLabel}
                  </Link>
                </Button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading course…
              </div>
            ) : error ? (
              <div
                role="alert"
                className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
              >
                {error}
              </div>
            ) : course ? (
              <div className="space-y-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {course.logoUrl ? (
                        <div className="relative h-14 w-14 overflow-hidden rounded-xl border border-border bg-black shadow-sm">
                          <Image
                            src={course.logoUrl}
                            alt={`${course.university} logo`}
                            fill
                            className="object-contain"
                            sizes="56px"
                          />
                        </div>
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <GraduationCap className="h-6 w-6" />
                        </div>
                      )}
                      <p className="text-sm font-bold uppercase tracking-widest text-primary">
                        {course.university}
                      </p>
                    </div>
                    <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
                      {course.title}
                    </h1>
                    <div className="flex flex-wrap items-center gap-6 text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4" />
                        <span>{course.location}</span>
                      </div>
                      {course.ucasCode && (
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4" />
                          <span>UCAS: {course.ucasCode}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-3 md:justify-end">
                    {actionButtons.map((action) => (
                      <Button
                        key={action.key}
                        asChild
                        size="lg"
                        variant={action.variant}
                        className={action.className}
                      >
                        <Link href={action.href} target="_blank" rel="noreferrer">
                          {action.label}
                        </Link>
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Highlights Bar */}
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {course.quickFacts.map((fact) => (
                    <div
                      key={fact.label}
                      className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/50 p-4 transition-colors hover:bg-card"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
                        <fact.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{fact.label}</span>
                        <p className="truncate font-semibold text-foreground" title={fact.value}>
                          {fact.value}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {course && !loading && !error && (
          <>
            {/* Sticky Tabs Navigation */}
            <div className="sticky top-0 z-20 border-b border-border/40 bg-background/80 backdrop-blur-md">
              <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10">
                <div className="relative">
                  <div role="tablist" aria-label="Course sections" className="flex gap-1 overflow-x-auto py-2 no-scrollbar">
                    {TABS.map((tab) => {
                      const isActive = activeTab === tab.id;
                      const Icon = tab.icon;
                      // Shorten multi-line labels for the tab button
                      const shortLabel = tab.label.replace('\n', ' ');
                      return (
                        <button
                          key={tab.id}
                          role="tab"
                          id={`course-tab-${tab.id}`}
                          aria-selected={isActive}
                          aria-controls="course-tabpanel"
                          onClick={() => setActiveTab(tab.id)}
                          className={cn(
                            'flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                            isActive
                              ? 'bg-primary text-primary-foreground shadow-md'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <Icon className="h-3.5 w-3.5 shrink-0" />
                          {shortLabel}
                        </button>
                      );
                    })}
                  </div>
                  {/* Right-edge gradient hint so users know more tabs exist */}
                  <div className="pointer-events-none absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-background/80 to-transparent" />
                </div>
              </div>
            </div>

            {/* Tab Content */}
            <div
              id="course-tabpanel"
              role="tabpanel"
              aria-labelledby={`course-tab-${activeTab}`}
              className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-10 min-h-[500px]"
            >

              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="w-full space-y-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-500">

                  {/* Summary Text */}
                  <div className="rounded-3xl border border-border/60 bg-card p-8 shadow-sm">
                    <h2 className="text-2xl font-bold mb-6">Course Overview</h2>
                    <div className="prose prose-lg prose-neutral dark:prose-invert max-w-4xl text-muted-foreground">
                      {renderRichText(course.summary)}
                    </div>
                  </div>

                  {course.courseRequirements && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8 shadow-sm">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <ListChecks className="h-5 w-5 text-primary" />
                        Course requirements
                      </h3>
                      <div className="prose prose-lg prose-neutral dark:prose-invert max-w-4xl text-muted-foreground">
                        {renderRichText(course.courseRequirements)}
                      </div>
                    </div>
                  )}

                  {course.careerOutcomesOverview && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-green-600 dark:text-green-400" />
                        Career snapshot
                      </h3>
                      <div className="prose prose-lg prose-neutral dark:prose-invert max-w-4xl text-muted-foreground">
                        {renderRichText(course.careerOutcomesOverview)}
                      </div>
                    </div>
                  )}

                  {course.studentLifeOverview && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Landmark className="h-5 w-5 text-primary" />
                        Student life
                      </h3>
                      <div className="prose prose-lg prose-neutral dark:prose-invert max-w-4xl text-muted-foreground">
                        {renderRichText(course.studentLifeOverview)}
                      </div>
                    </div>
                  )}

                  {/* University at a Glance Stats */}
                  {(course.numberOfStudents || course.studentToStaffRatio || course.nssPct || course.internationalStudentsPct) && (
                    <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-muted/50 to-muted/5 p-8">
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Landmark className="h-5 w-5 text-primary" />
                        The University at a Glance
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {course.numberOfStudents && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Student Population</p>
                            <p className="text-2xl font-bold text-foreground">{course.numberOfStudents.toLocaleString()}</p>
                          </div>
                        )}
                        {course.studentToStaffRatio && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Staff Ratio</p>
                            <p className="text-2xl font-bold text-foreground">{course.studentToStaffRatio.toFixed(1)}:1</p>
                          </div>
                        )}
                        {course.nssPct && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Satisfaction (NSS)</p>
                            <p className="text-2xl font-bold text-foreground">{course.nssPct.toFixed(1)}%</p>
                          </div>
                        )}
                        {course.internationalStudentsPct && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">International</p>
                            <p className="text-2xl font-bold text-foreground">{course.internationalStudentsPct.toFixed(1)}%</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Career Outcomes Highlights */}
                  {(course.graduateEmploymentRate || course.averageStartingSalary || course.placementYear) && (
                    <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-green-500/5 to-green-500/0 p-8">
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-green-600 dark:text-green-400" />
                        Career Prospects
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-3">
                        {course.graduateEmploymentRate && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Employment Rate</p>
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{course.graduateEmploymentRate.toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground mt-1">of graduates employed</p>
                          </div>
                        )}
                        {course.averageStartingSalary && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Avg Starting Salary</p>
                            <p className="text-2xl font-bold tabular-nums text-foreground">{new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(course.averageStartingSalary)}</p>
                            <p className="text-xs text-muted-foreground mt-1">First-year earnings</p>
                          </div>
                        )}
                        {course.placementYear && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Placement Year</p>
                            <p className="text-lg font-bold text-foreground">✓ Available</p>
                            <p className="text-xs text-muted-foreground mt-1">Work experience option</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Cost & Living Overview */}
                  {hasCostDetails && (
                    <div className="rounded-3xl border border-border/60 bg-gradient-to-br from-orange-500/5 to-orange-500/0 p-8">
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        Costs & Living
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-3">
                        {formattedCostTuition && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">{formattedDomesticTuition ? 'Intl. Tuition' : 'Annual Tuition'}</p>
                            <p className="text-2xl font-bold tabular-nums text-foreground">{formattedCostTuition}</p>
                          </div>
                        )}
                        {formattedDomesticTuition && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Home Tuition</p>
                            <p className="text-2xl font-bold tabular-nums text-foreground">{formattedDomesticTuition}</p>
                          </div>
                        )}
                        {course.studentDormCost && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Halls of Residence</p>
                            <p className="text-2xl font-bold tabular-nums text-foreground">{formatCurrencyString(course.studentDormCost, 'GBP')}</p>
                            <p className="text-xs text-muted-foreground mt-1">per year</p>
                          </div>
                        )}
                        {course.averageRentOutsideCampus && (
                          <div className="rounded-2xl bg-card/50 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Off-Campus Rent</p>
                            <p className="text-2xl font-bold tabular-nums text-foreground">{formatCurrencyString(course.averageRentOutsideCampus, 'GBP')}</p>
                            <p className="text-xs text-muted-foreground mt-1">per month (avg)</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Campus Life Highlights */}
                  {(course.universityLife || course.culturalSocialEnvironment || course.cityLife) && (
                    <div className="grid gap-4 md:grid-cols-2">
                      {course.universityLife && (
                        <div className="rounded-3xl border border-border/60 bg-card p-6">
                          <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                            <Landmark className="h-4 w-4 text-primary" />
                            University Life
                          </h4>
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {typeof course.universityLife === 'string' ? course.universityLife : 'Vibrant campus life with diverse student community'}
                          </p>
                          <button
                            onClick={() => setActiveTab('campus')}
                            className="text-xs font-bold text-primary uppercase tracking-wider mt-3 hover:text-primary/80"
                          >
                            Learn More →
                          </button>
                        </div>
                      )}
                      {course.cityLife && (
                        <div className="rounded-3xl border border-border/60 bg-card p-6">
                          <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            City & Location
                          </h4>
                          <p className="text-sm text-muted-foreground line-clamp-3">
                            {typeof course.cityLife === 'string' ? course.cityLife : 'Located in a vibrant city with plenty to explore'}
                          </p>
                          <button
                            onClick={() => setActiveTab('campus')}
                            className="text-xs font-bold text-primary uppercase tracking-wider mt-3 hover:text-primary/80"
                          >
                            Learn More →
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Outcomes */}
                  {hasOutcomes && course.outcomes && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8 shadow-sm">
                      <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                          Student Outcomes & Satisfaction
                        </h2>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {course.outcomes.satisfaction && (
                          <Card className="border-border/60 bg-primary/5 border-primary/20">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-xs font-bold text-primary uppercase tracking-wider">Student Satisfaction</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-lg font-semibold text-foreground">{course.outcomes.satisfaction}</p>
                            </CardContent>
                          </Card>
                        )}
                        {course.outcomes.employment && (
                          <Card className="border-border/60">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employment</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-lg font-semibold text-foreground">{course.outcomes.employment}</p>
                            </CardContent>
                          </Card>
                        )}
                        {course.outcomes.outcomes && (
                          <Card className="border-border/60">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Outcomes</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-lg font-semibold text-foreground">{course.outcomes.outcomes}</p>
                            </CardContent>
                          </Card>
                        )}
                        {course.outcomes.salary && (
                          <Card className="border-border/60">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Average Salary (15m)</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <p className="text-lg font-semibold text-foreground">{formatCurrencyString(course.outcomes.salary)}</p>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Open Days / Events */}
                  {course.openDays && course.openDays.length > 0 && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8 shadow-sm">
                      <h2 className="text-2xl font-bold mb-4">Upcoming Events</h2>
                      <div className="space-y-3">
                        {course.openDays.map((event, idx) => (
                          <div key={idx} className="flex items-start gap-3 rounded-2xl border border-border/40 bg-muted/20 p-4">
                            <div className="mt-1 h-2 w-2 rounded-full bg-primary" aria-hidden />
                            <div className="flex flex-col">
                              <span className="text-sm font-semibold text-foreground">{event.label}</span>
                              {event.url ? (
                                <Link
                                  href={event.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-xs font-semibold text-primary hover:underline"
                                >
                                  View details
                                </Link>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick Navigation - Requirements & Curriculum */}
                  <div className="grid gap-6 md:grid-cols-2">

                    {/* Requirements Preview */}
                    <button
                      type="button"
                      className="group relative block w-full overflow-hidden rounded-3xl border border-border/60 bg-card p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => setActiveTab('requirements')}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <ListChecks className="h-5 w-5 text-primary" />
                          Entry Requirements
                        </h3>
                        <ArrowLeft className="h-4 w-4 rotate-180 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
                      </div>
                      <div className="space-y-3">
                        {/* Show top 3 short requirements */}
                        {course.requirements.slice(0, 3).map((r, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{r.label}</span>
                            <span className="font-medium text-foreground truncate max-w-[120px]">{r.value}</span>
                          </div>
                        ))}
                        {course.requirements.length === 0 && <p className="text-sm text-muted-foreground italic">View requirements details…</p>}
                      </div>
                      <div className="mt-4 text-xs font-bold text-primary uppercase tracking-wider">View Full Details</div>
                    </button>

                    {/* Curriculum Preview */}
                    <button
                      type="button"
                      className="group relative block w-full overflow-hidden rounded-3xl border border-border/60 bg-card p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={() => setActiveTab('curriculum')}
                    >
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold flex items-center gap-2">
                          <Layers className="h-5 w-5 text-primary" />
                          Curriculum
                        </h3>
                        <ArrowLeft className="h-4 w-4 rotate-180 opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-1" />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {course.modules ? course.modules.slice(0, 150) + "…" : "Explore the modules and subjects you will study."}
                        </p>
                      </div>
                      <div className="mt-4 text-xs font-bold text-primary uppercase tracking-wider">View Modules</div>
                    </button>

                  </div>
                </div>
              )}

              {/* Curriculum Tab */}
              {activeTab === 'curriculum' && (
                <div className="w-full space-y-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-bold">Course Curriculum</h2>
                    {moduleItems.length > 8 && !moduleYearSections.length && (
                      <Button
                        variant="outline"
                        onClick={() => setShowAllFlatModules(!showAllFlatModules)}
                      >
                        {showAllFlatModules ? 'Show Less' : 'Show All'}
                      </Button>
                    )}
                  </div>

                  {moduleYearSections.length ? (
                    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                      {moduleYearSections.map((section, idx) => (
                        <Card key={idx} className="overflow-hidden border-border/60 bg-card hover:shadow-md transition-all">
                          <CardHeader className="bg-muted/30 pb-4 border-b border-border/40">
                            <CardTitle className="flex items-center gap-3 text-lg">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary text-sm font-bold">
                                {section.yearNum ?? idx + 1}
                              </div>
                              {section.title}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="p-0">
                            <ul className="divide-y divide-border/40">
                              {section.items.map((item, i) => (
                                <li key={i} className="flex items-start gap-3 p-4 hover:bg-muted/20 transition-colors">
                                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                                  <span className="text-sm text-foreground/80 leading-relaxed">{emphasize(item)}</span>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : moduleItems.length ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {(showAllFlatModules ? moduleItems : moduleItems.slice(0, 9)).map((item, idx) => (
                        <div key={idx} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card p-5 hover:border-primary/40 transition-colors">
                          <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          <span className="text-sm font-medium text-foreground/90 leading-relaxed">{emphasize(item)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <p className="text-muted-foreground italic">No specific curriculum modules available for this course.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Requirements Tab */}
              {activeTab === 'requirements' && (
                <div className="w-full space-y-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-500">
                  <h2 className="text-2xl font-bold">Entry Requirements</h2>

                  {/* 1. Key Metrics Row (Grades, Points - things that are short) */}
                  {course.requirements.some(r => ['IB minimum', 'A-Levels', 'UCAS points'].includes(r.label)) && (
                    <div className="grid gap-4 sm:grid-cols-3">
                      {course.requirements
                        .filter(req => ['IB minimum', 'A-Levels', 'UCAS points'].includes(req.label))
                        .map((req, idx) => {
                          const separator = req.value.match(/[,;]/);
                          const splitIndex = separator ? separator.index : -1;

                          const headline = splitIndex !== -1 ? req.value.substring(0, splitIndex) : req.value;
                          const rawSubtext = splitIndex !== -1 ? req.value.substring(splitIndex! + 1).trim() : null;

                          // Parse subtext into list items
                          // Split by semicolon or comma to create a clean list
                          const subtextItems = rawSubtext
                            ? rawSubtext.split(/;|(?<=\w), /)
                              .map(s => s.trim())
                              .filter(s => s.length > 0)
                            : [];

                          return (
                            <Card key={idx} className="border-border/60 bg-primary/5 border-primary/20">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-xs font-bold text-primary uppercase tracking-wider">
                                  {req.label}
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <div className="text-2xl font-bold text-foreground">
                                  {headline}
                                </div>
                                {subtextItems.length > 0 && (
                                  <ul className="space-y-1">
                                    {subtextItems.map((item, i) => (
                                      <li key={i} className="flex items-start gap-2 text-xs font-medium text-muted-foreground leading-snug">
                                        <div className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
                                        <span>{item}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                    </div>
                  )}

                  {/* 2. Detailed Requirements (Subjects, Overview, English, etc.) */}
                  <div className="space-y-4">
                    {course.requirements
                      .filter(req => !['IB minimum', 'A-Levels', 'UCAS points'].includes(req.label))
                      .map((req, idx) => (
                        <div key={idx} className="rounded-2xl border border-border/60 bg-card overflow-hidden">
                          <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
                            <h3 className="font-semibold text-foreground">{req.label}</h3>
                          </div>
                          <div className="p-6">
                            <RequirementRenderer value={req.value} />
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Fallback */}
                  {course.requirements.length === 0 && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <p className="text-muted-foreground italic">No specific entry requirements listed.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Assessment Tab */}
              {activeTab === 'assessment' && (
                <div className="w-full space-y-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-500">
                  <div className="rounded-3xl border border-border/60 bg-card p-8 shadow-sm">
                    <h2 className="text-2xl font-bold mb-6">Assessment Methods</h2>
                    {course.assessment ? (
                      <div className="prose prose-lg prose-neutral dark:prose-invert max-w-4xl text-muted-foreground">
                        {renderRichText(course.assessment)}
                      </div>
                    ) : (
                      <p className="text-muted-foreground italic">No assessment information available.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Campus Life Tab */}
              {activeTab === 'campus' && (
                <div className="w-full space-y-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-500">
                  <h2 className="text-2xl font-bold">Campus & City Life</h2>

                  {/* University Stats Grid */}
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {course.numberOfStudents && (
                      <Card className="border-border/60 bg-gradient-to-br from-primary/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-primary uppercase tracking-wider">Student Population</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{course.numberOfStudents.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground mt-1">Total students</p>
                        </CardContent>
                      </Card>
                    )}
                    {course.studentToStaffRatio && (
                      <Card className="border-border/60 bg-gradient-to-br from-blue-500/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Staff Ratio</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{course.studentToStaffRatio.toFixed(0)}:1</p>
                          <p className="text-xs text-muted-foreground mt-1">Students per staff</p>
                        </CardContent>
                      </Card>
                    )}
                    {course.nssPct && (
                      <Card className="border-border/60 bg-gradient-to-br from-green-500/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">Satisfaction (NSS)</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{course.nssPct.toFixed(0)}%</p>
                          <p className="text-xs text-muted-foreground mt-1">Student satisfaction</p>
                        </CardContent>
                      </Card>
                    )}
                    {course.internationalStudentsPct && (
                      <Card className="border-border/60 bg-gradient-to-br from-orange-500/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">International Students</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{course.internationalStudentsPct.toFixed(0)}%</p>
                          <p className="text-xs text-muted-foreground mt-1">Of student body</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Quick-glance campus attributes */}
                  {(course.universityLife || course.cityLife || course.climate || course.safety || course.transportAccessibility) && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <Landmark className="h-5 w-5 text-primary" />
                        Campus at a Glance
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {course.universityLife && (
                          <div className="rounded-2xl bg-muted/30 border border-border/40 p-4">
                            <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Campus Type</p>
                            <p className="text-sm font-semibold text-foreground">{course.universityLife}</p>
                          </div>
                        )}
                        {course.cityLife && (
                          <div className="rounded-2xl bg-muted/30 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">City Size</p>
                            <p className="text-sm font-semibold text-foreground">{course.cityLife}</p>
                          </div>
                        )}
                        {course.climate && (
                          <div className="rounded-2xl bg-muted/30 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Climate</p>
                            <p className="text-sm font-semibold text-foreground">{course.climate}</p>
                          </div>
                        )}
                        {course.safety && (
                          <div className="rounded-2xl bg-muted/30 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Safety Index</p>
                            <p className="text-sm font-semibold text-foreground">{course.safety}/10</p>
                          </div>
                        )}
                        {course.transportAccessibility && (
                          <div className="rounded-2xl bg-muted/30 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Transport</p>
                            <p className="text-sm font-semibold text-foreground">{course.transportAccessibility}</p>
                          </div>
                        )}
                        {course.culturalSocialEnvironment && (
                          <div className="rounded-2xl bg-muted/30 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Social Scene</p>
                            <p className="text-sm font-semibold text-foreground">{course.culturalSocialEnvironment}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Student Life Overview narrative */}
                  {course.studentLifeOverview && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" />
                        Student Life & City
                      </h3>
                      <div className="prose prose-lg prose-neutral dark:prose-invert max-w-4xl text-muted-foreground">
                        {renderRichText(course.studentLifeOverview, { forceBullets: true })}
                      </div>
                    </div>
                  )}

                  {/* Student Life Tags */}
                  {course.studentLifeTags && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-6">What Students Love</h3>
                      <div className="flex flex-wrap gap-3">
                        {course.studentLifeTags.split(/[,;|]+/).map((tag, idx) => (
                          <span key={idx} className="inline-flex items-center rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20">
                            {tag.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Breakdown table — same pattern as Cost Breakdown */}
                  {(course.numberOfStudents || course.studentToStaffRatio || course.nssPct || course.internationalStudentsPct) && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-6">University Stats</h3>
                      <div className="space-y-4">
                        {course.numberOfStudents && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">Total Students</span>
                            <span className="text-lg font-bold text-primary">{course.numberOfStudents.toLocaleString()}</span>
                          </div>
                        )}
                        {course.studentToStaffRatio && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">Student-to-Staff Ratio</span>
                            <span className="text-lg font-bold">{course.studentToStaffRatio.toFixed(0)}:1</span>
                          </div>
                        )}
                        {course.nssPct && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">NSS Student Satisfaction</span>
                            <span className="text-lg font-bold text-green-600 dark:text-green-400">{course.nssPct.toFixed(0)}%</span>
                          </div>
                        )}
                        {course.internationalStudentsPct && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">International Students</span>
                            <span className="text-lg font-bold">{course.internationalStudentsPct.toFixed(0)}%</span>
                          </div>
                        )}
                        {course.safety && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">Safety Index</span>
                            <span className="text-lg font-bold">{course.safety}/10</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!course.universityLife && !course.studentLifeOverview && !course.culturalSocialEnvironment && !course.cityLife && !course.numberOfStudents && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <p className="text-muted-foreground italic">Campus and student life information coming soon.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Career Tab */}
              {activeTab === 'career' && (
                <div className="w-full space-y-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-500">
                  <h2 className="text-2xl font-bold">Career & Outcomes</h2>

                  {/* Career Stats Grid */}
                  <div className="grid gap-4 md:grid-cols-3">
                    {course.graduateEmploymentRate && (
                      <Card className="border-border/60 bg-gradient-to-br from-green-500/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">Graduate Employment</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-3xl font-bold text-foreground">{course.graduateEmploymentRate.toFixed(0)}%</p>
                          <p className="text-xs text-muted-foreground mt-1">Employed after graduation</p>
                        </CardContent>
                      </Card>
                    )}
                    {course.averageStartingSalary && (
                      <Card className="border-border/60 bg-gradient-to-br from-blue-500/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Avg Starting Salary</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{formatCurrencyString(course.averageStartingSalary, 'GBP')}</p>
                          <p className="text-xs text-muted-foreground mt-1">Average first-year salary</p>
                        </CardContent>
                      </Card>
                    )}
                    {course.placementYear !== null && course.placementYear !== undefined && (
                      <Card className={`border-border/60 bg-gradient-to-br ${course.placementYear ? 'from-purple-500/5 to-transparent' : 'from-muted/30 to-transparent'}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className={`text-xs font-bold uppercase tracking-wider ${course.placementYear ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'}`}>Placement Year</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{course.placementYear ? '✓ Available' : '✗ Not offered'}</p>
                          <p className="text-xs text-muted-foreground mt-1">Industry work experience</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Career Overview narrative */}
                  {course.careerOutcomesOverview && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-green-600 dark:text-green-400" />
                        Career Outcomes Overview
                      </h3>
                      <div className="prose prose-lg prose-neutral dark:prose-invert max-w-4xl text-muted-foreground">
                        {renderRichText(course.careerOutcomesOverview, { forceBullets: true })}
                      </div>
                    </div>
                  )}

                  {/* Top Industries */}
                  {course.topIndustries && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-6">Top Industries for Graduates</h3>
                      <div className="flex flex-wrap gap-3">
                        {course.topIndustries.split(/[,;|]/).map((industry, idx) => (
                          <span key={idx} className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary ring-1 ring-primary/20">
                            <Dot className="h-3 w-3 shrink-0" />
                            {industry.trim()}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Placement Year Detail */}
                  {course.placementYearDetail && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-4">Placement Year Detail</h3>
                      <div className="prose prose-neutral dark:prose-invert max-w-4xl text-muted-foreground">
                        {renderRichText(course.placementYearDetail, { forceBullets: true })}
                      </div>
                    </div>
                  )}

                  {/* Study Abroad */}
                  {course.studyAbroadOption && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-primary" />
                        Study Abroad Opportunities
                      </h3>
                      <div className="prose prose-neutral dark:prose-invert max-w-4xl text-muted-foreground">
                        {renderRichText(course.studyAbroadOption, { forceBullets: true })}
                      </div>
                    </div>
                  )}

                  {/* Outcomes data from legacy fields */}
                  {hasOutcomes && course.outcomes && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                        Student Outcomes
                      </h3>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {course.outcomes.satisfaction && (
                          <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4">
                            <p className="text-xs font-bold text-primary uppercase tracking-wider mb-2">Student Satisfaction</p>
                            <p className="text-lg font-semibold text-foreground">{course.outcomes.satisfaction}</p>
                          </div>
                        )}
                        {course.outcomes.employment && (
                          <div className="rounded-2xl bg-muted/30 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Employment</p>
                            <p className="text-lg font-semibold text-foreground">{course.outcomes.employment}</p>
                          </div>
                        )}
                        {course.outcomes.outcomes && (
                          <div className="rounded-2xl bg-muted/30 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Outcomes</p>
                            <p className="text-lg font-semibold text-foreground">{course.outcomes.outcomes}</p>
                          </div>
                        )}
                        {course.outcomes.salary && (
                          <div className="rounded-2xl bg-muted/30 border border-border/40 p-4">
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Avg Salary (15m)</p>
                            <p className="text-lg font-semibold text-foreground">{formatCurrencyString(course.outcomes.salary)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!course.graduateEmploymentRate && !course.averageStartingSalary && course.placementYear === null && !course.topIndustries && !course.studyAbroadOption && !course.careerOutcomesOverview && !hasOutcomes && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <p className="text-muted-foreground italic">Career and outcomes information coming soon.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Costs Tab */}
              {activeTab === 'costs' && (
                <div className="w-full space-y-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 duration-500">
                  <h2 className="text-2xl font-bold">Costs & Living Expenses</h2>

                  {/* Cost Overview Cards */}
                  <div className="grid gap-4 md:grid-cols-3">
                    {formattedCostTuition && (
                      <Card className="border-border/60 bg-gradient-to-br from-orange-500/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider">{formattedDomesticTuition ? 'Intl. Tuition' : 'Annual Tuition'}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{formattedCostTuition}</p>
                          <p className="text-xs text-muted-foreground mt-1">Per year</p>
                        </CardContent>
                      </Card>
                    )}
                    {formattedDomesticTuition && (
                      <Card className="border-border/60 bg-gradient-to-br from-green-500/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">Home Tuition</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{formattedDomesticTuition}</p>
                          <p className="text-xs text-muted-foreground mt-1">Per year</p>
                        </CardContent>
                      </Card>
                    )}
                    {totalCost && (
                      <Card className="border-border/60 bg-gradient-to-br from-red-500/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Total Programme Cost</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{formatCurrencyString(totalCost, course.currency)}</p>
                          <p className="text-xs text-muted-foreground mt-1">For full {course.duration}</p>
                        </CardContent>
                      </Card>
                    )}
                    {course.studentDormCost && (
                      <Card className="border-border/60 bg-gradient-to-br from-blue-500/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">Halls of Residence</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{formatCurrencyString(course.studentDormCost, 'GBP')}</p>
                          <p className="text-xs text-muted-foreground mt-1">Per year</p>
                        </CardContent>
                      </Card>
                    )}
                    {course.averageRentOutsideCampus && (
                      <Card className="border-border/60 bg-gradient-to-br from-cyan-500/5 to-transparent">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-xs font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">Off-Campus Rent</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-2xl font-bold text-foreground">{formatCurrencyString(course.averageRentOutsideCampus, 'GBP')}</p>
                          <p className="text-xs text-muted-foreground mt-1">Per month (average)</p>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Cost of Living Indicator */}
                  {course.costOfLife && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-4">Overall Cost of Living</h3>
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "flex h-16 w-16 items-center justify-center rounded-2xl text-lg font-bold",
                          course.costOfLife === 'HIGH' && "bg-red-500/10 text-red-600 dark:text-red-400",
                          course.costOfLife === 'MEDIUM' && "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
                          course.costOfLife === 'LOW' && "bg-green-500/10 text-green-600 dark:text-green-400"
                        )}>
                          {course.costOfLife}
                        </div>
                        <div>
                          <p className="text-muted-foreground">
                            {course.costOfLife === 'HIGH' && "This location has a higher cost of living. Budget accordingly for accommodation, food, and general expenses."}
                            {course.costOfLife === 'MEDIUM' && "This location has moderate living costs. Standard student budget recommended."}
                            {course.costOfLife === 'LOW' && "This location has a lower cost of living, making it more affordable for student life."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Cost Breakdown */}
                  {(costTuition || course.studentDormCost || course.averageRentOutsideCampus || course.intlTuitionLow || course.intlTuitionHigh) && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-6">Estimated Annual Costs</h3>
                      <div className="space-y-4">
                        {formattedCostTuition && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">{formattedDomesticTuition ? 'Tuition (International)' : 'Tuition Fees'}</span>
                            <span className="text-lg font-bold text-primary">{formattedCostTuition}</span>
                          </div>
                        )}
                        {formattedDomesticTuition && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">Tuition (Home/EU)</span>
                            <span className="text-lg font-bold text-green-600 dark:text-green-400">{formattedDomesticTuition}</span>
                          </div>
                        )}
                        {course.studentDormCost && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">Student Accommodation</span>
                            <span className="text-lg font-bold">{formatCurrencyString(course.studentDormCost, 'GBP')}</span>
                          </div>
                        )}
                        {course.averageRentOutsideCampus && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">Off-Campus Rent (estimated)</span>
                            <span className="text-lg font-bold">{formatCurrencyString(course.averageRentOutsideCampus * 12, 'GBP')}</span>
                          </div>
                        )}
                        {(course.intlTuitionLow || course.intlTuitionHigh) && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">University Estimate</span>
                            <span className="text-lg font-bold text-primary">
                              {course.intlTuitionLow && course.intlTuitionHigh
                                ? `${formatCurrencyString(course.intlTuitionLow, course.currency)} – ${formatCurrencyString(course.intlTuitionHigh, course.currency)}`
                                : course.intlTuitionLow
                                  ? formatCurrencyString(course.intlTuitionLow, course.currency)
                                  : formatCurrencyString(course.intlTuitionHigh, course.currency)}
                            </span>
                          </div>
                        )}
                        {(course.tuition || course.studentDormCost || course.averageRentOutsideCampus) && (
                          <div className="flex items-center justify-between pt-4 border-t-2 border-border/60">
                            <span className="text-foreground font-bold text-lg">Estimated Total (per year)</span>
                            <span className="text-2xl font-bold text-primary">
                              {formatCurrencyString(
                                numericCostTuition +
                                (course.studentDormCost ?? 0) +
                                ((course.averageRentOutsideCampus ?? 0) * 12),
                                course.currency ?? 'GBP'
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Monthly Living Cost Breakdown */}
                  {(course.monthlyHousingGbp || course.monthlyFoodGbp || course.monthlyTransportGbp) && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-6">Monthly Student Budget</h3>
                      <div className="space-y-4">
                        {course.monthlyHousingGbp && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">Housing</span>
                            <span className="text-lg font-bold">{formatCurrencyString(course.monthlyHousingGbp, 'GBP')}<span className="text-xs text-muted-foreground font-normal ml-1">/mo</span></span>
                          </div>
                        )}
                        {course.monthlyFoodGbp && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">Food & Groceries</span>
                            <span className="text-lg font-bold">{formatCurrencyString(course.monthlyFoodGbp, 'GBP')}<span className="text-xs text-muted-foreground font-normal ml-1">/mo</span></span>
                          </div>
                        )}
                        {course.monthlyTransportGbp && (
                          <div className="flex items-center justify-between pb-4 border-b border-border/40">
                            <span className="text-foreground font-medium">Transport</span>
                            <span className="text-lg font-bold">{formatCurrencyString(course.monthlyTransportGbp, 'GBP')}<span className="text-xs text-muted-foreground font-normal ml-1">/mo</span></span>
                          </div>
                        )}
                        {course.monthlyTotalGbp && (
                          <div className="flex items-center justify-between pt-4 border-t-2 border-border/60">
                            <span className="text-foreground font-bold text-lg">Estimated Monthly Total</span>
                            <span className="text-2xl font-bold text-primary">{formatCurrencyString(course.monthlyTotalGbp, 'GBP')}</span>
                          </div>
                        )}
                        {course.annualLivingCostGbp && (
                          <div className="flex items-center justify-between pt-2">
                            <span className="text-muted-foreground text-sm">Annual living costs</span>
                            <span className="text-base font-semibold text-muted-foreground">{formatCurrencyString(course.annualLivingCostGbp, 'GBP')}/yr</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Cost Overview narrative */}
                  {course.costOverview && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        Cost Overview
                      </h3>
                      <div className="prose prose-lg prose-neutral dark:prose-invert max-w-4xl text-muted-foreground">
                        {renderRichText(course.costOverview, { forceBullets: true })}
                      </div>
                    </div>
                  )}

                  {!course.tuition && !course.studentDormCost && !course.averageRentOutsideCampus && !course.costOfLife && !course.monthlyTotalGbp && (
                    <div className="rounded-3xl border border-border/60 bg-card p-8">
                      <p className="text-muted-foreground italic">Cost and living expense information coming soon.</p>
                    </div>
                  )}
                </div>
              )}

            </div>
          </>
        )}
      </main>
    </div>
  );
}
