'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useSearchParamState } from '@/lib/hooks/use-search-param-state';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { PageHeroSkeleton } from '@/components/layout/page-hero-skeleton';
import {
  extractBulletItems,
  extractYearSections,
  formatCurrencyString,
  mapRawData
} from './_components/course-data';
import { PROGRAMS_SELECT } from './_components/programs-select';
import { AssessmentPanel } from './_components/assessment-panel';
import { CampusPanel } from './_components/campus-panel';
import { CareerPanel } from './_components/career-panel';
import { CostsPanel } from './_components/costs-panel';
import { CourseHero, CourseQuickFacts } from './_components/course-hero';
import { COURSE_TAB_IDS, CourseTabs } from './_components/course-tabs';
import { CurriculumPanel } from './_components/curriculum-panel';
import { OverviewPanel } from './_components/overview-panel';
import { RequirementsPanel } from './_components/requirements-panel';
import type { CourseCosts, CourseRawData, CourseTabId, CourseView } from './_components/types';

// Re-exported because `page.tsx` has always imported the SSR payload type from
// here; the type itself now lives with the rest of the view model.
export type { CourseRawData };

/**
 * The course detail page.
 *
 * This file used to be ~1,980 lines: the view model, every text parser, seven
 * tab panels and a bespoke page chrome (its own `min-h-screen`, its own bare
 * `<Navbar>`, its own `max-w-6xl` gutter) all in one client component. The
 * chrome is now the app shell (`layout.tsx` → `<DashboardShell>`), which is what
 * restores the sidebar, the mobile bottom nav, the command palette and the chat
 * widget to this route; the parsing lives in `_components/course-data.ts` and
 * each panel in its own file. What's left here is the data load, the derived
 * numbers the panels share, and the tab wiring.
 */
export function CoursePageClient({ params, initialData }: { params: { id: string }; initialData?: CourseRawData | null }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [course, setCourse] = useState<CourseView | null>(null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  // Owned here, not in CurriculumPanel: TabsContent unmounts inactive panels, so
  // panel-local state resets whenever you leave the tab and return.
  const [showAllFlatModules, setShowAllFlatModules] = useState(false);

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

  useEffect(() => {
    if (initialData) {
      setCourse(mapRawData(initialData.programData, initialData.universityData));
      return;
    }

    const fetchCourse = async () => {
      setLoading(true);
      setError(null);
      try {
        const supabase = getBrowserSupabaseClient();
        const { data, error: supabaseError } = await supabase
          .from('programs')
          .select(PROGRAMS_SELECT)
          .eq('id', params.id)
          .maybeSingle();

        if (supabaseError) throw supabaseError;
        if (!data) {
          setError('Course not found.');
          return;
        }

        const rawData = data as Record<string, any>;
        setCourse(mapRawData(rawData, rawData.universities ?? {}));
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

    // `fetchCourse` routes its own failures into `setError`. This terminal
    // `.catch` is the backstop for anything it missed: without it a rejection is
    // dropped and the page sits on its skeleton forever with no explanation.
    fetchCourse().catch((err: unknown) => {
      console.error('[CoursePageClient] fetch error:', err);
      setError('Unable to load this course.');
      setLoading(false);
    });
  }, [params.id, initialData]);

  const [activeTabParam, setActiveTab] = useSearchParamState('tab', 'overview');
  // `?tab=` is user-supplied, so an unknown value must not leave every panel
  // unmounted (which is what the old `activeTab === '…'` chain did).
  const activeTab = (COURSE_TAB_IDS as string[]).includes(activeTabParam)
    ? (activeTabParam as CourseTabId)
    : 'overview';

  const moduleItems = useMemo(() => extractBulletItems(course?.modules), [course?.modules]);
  const moduleYearSections = useMemo(
    () => extractYearSections(course?.modules, course?.duration),
    [course?.modules, course?.duration]
  );

  const hasOutcomes = Boolean(course?.outcomes && (
    course.outcomes.satisfaction ||
    course.outcomes.employment ||
    course.outcomes.outcomes ||
    course.outcomes.salary
  ));

  const costs = useMemo<CourseCosts>(() => {
    const costTuition =
      course?.tuition
        ? String(course.tuition)
        : course?.yearlyIntlTuition
          ? String(course.yearlyIntlTuition)
          : course?.tuitionFeesInternational ?? course?.tuitionFeesHome ?? null;

    const parsed = costTuition ? Number(String(costTuition).replace(/[^0-9.-]+/g, '')) : 0;
    const numericCostTuition = Number.isFinite(parsed) ? parsed : 0;

    const durationYears = course?.duration?.match(/(\d+)/);
    const years = durationYears ? parseInt(durationYears[1], 10) : 0;

    return {
      costTuition,
      formattedCostTuition: costTuition ? formatCurrencyString(costTuition, course?.currency) : null,
      formattedDomesticTuition: course?.domesticTuition
        ? formatCurrencyString(course.domesticTuition, course.currency)
        : null,
      numericCostTuition,
      totalCost: years > 0 && numericCostTuition ? numericCostTuition * years : null,
      hasCostDetails: Boolean(
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
      )
    };
  }, [course]);

  if (loading) {
    return (
      <>
        <PageHeroSkeleton breadcrumbs eyebrow actions />
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading course…
        </p>
      </>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-border bg-card px-4 py-3 text-sm text-danger">
        {error}
      </div>
    );
  }

  if (!course) return null;

  return (
    <>
      <CourseHero
        course={course}
        backHref={backHref}
        backLabel={backLabel}
        fromSearch={fromSearch}
        onBackToResults={handleBackToResults}
      />
      <CourseQuickFacts course={course} />
      <CourseTabs
        value={activeTab}
        onValueChange={setActiveTab}
        panels={{
          overview: (
            <OverviewPanel course={course} costs={costs} hasOutcomes={hasOutcomes} onNavigate={setActiveTab} />
          ),
          curriculum: (
            <CurriculumPanel
              yearSections={moduleYearSections}
              moduleItems={moduleItems}
              showAllFlat={showAllFlatModules}
              onToggleShowAllFlat={() => setShowAllFlatModules((v) => !v)}
            />
          ),
          requirements: <RequirementsPanel requirements={course.requirements} />,
          assessment: <AssessmentPanel assessment={course.assessment} />,
          campus: <CampusPanel course={course} />,
          career: <CareerPanel course={course} hasOutcomes={hasOutcomes} />,
          costs: <CostsPanel course={course} costs={costs} />
        }}
      />
    </>
  );
}
