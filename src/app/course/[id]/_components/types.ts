import type { ElementType } from 'react';

/**
 * The raw Supabase rows handed to the client from `page.tsx` (SSR) — kept as
 * loose records because `programs`/`universities` are wider than the generated
 * types (see CLAUDE.md: `database.ts` lags the schema).
 */
export type CourseRawData = {
  programData: Record<string, any>;
  universityData: Record<string, any>;
};

export type Requirement = { label: string; value: string };
export type QuickFact = { label: string; value: string; icon: ElementType };

export type Outcomes = {
  satisfaction?: string | null;
  employment?: string | null;
  outcomes?: string | null;
  salary?: string | null;
};

export type OpenDayEvent = { label: string; url?: string | null };

/** The single view model every panel reads. Built once by `mapRawData`. */
export type CourseView = {
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

/**
 * Money figures derived from `CourseView`, computed once in the page component
 * and handed to the Overview and Costs panels (both render them).
 */
export type CourseCosts = {
  /** Raw tuition string, first of the four candidate columns that has a value. */
  costTuition: string | null;
  formattedCostTuition: string | null;
  formattedDomesticTuition: string | null;
  /** `costTuition` reduced to a number for arithmetic; 0 when unparseable. */
  numericCostTuition: number;
  /** Tuition × programme years, when the duration parses. */
  totalCost: number | null;
  hasCostDetails: boolean;
};

/** Every tab id, in bar order. Also the `?tab=` query values. */
export type CourseTabId =
  | 'overview'
  | 'curriculum'
  | 'requirements'
  | 'assessment'
  | 'campus'
  | 'career'
  | 'costs';
