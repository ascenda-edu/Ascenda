'use client';

import { Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrencyString } from './course-data';
import { RichText } from './rich-text';
import { BreakdownRow, MetricTile, PanelEmpty, PanelHeading, SectionCard } from './tiles';
import type { CourseCosts, CourseView } from './types';

/**
 * Cost-of-living band → tone. Three known values out of the catalogue.
 *
 * The 64px block this drives is a TILE, not a chip, so it does not take a tint — the
 * tone stays on the HIGH/MEDIUM/LOW label, which is the word being read, and the
 * block itself is a neutral surface.
 */
const COST_OF_LIFE_VISUAL: Record<string, { surface: string; copy: string }> = {
  HIGH: {
    surface: 'bg-muted text-danger',
    copy: 'This location has a higher cost of living. Budget accordingly for accommodation, food, and general expenses.'
  },
  MEDIUM: {
    surface: 'bg-muted text-warning',
    copy: 'This location has moderate living costs. Standard student budget recommended.'
  },
  LOW: {
    surface: 'bg-muted text-success',
    copy: 'This location has a lower cost of living, making it more affordable for student life.'
  }
};

export function CostsPanel({ course, costs }: { course: CourseView; costs: CourseCosts }) {
  const { costTuition, formattedCostTuition, formattedDomesticTuition, numericCostTuition, totalCost } = costs;

  const band = course.costOfLife ? COST_OF_LIFE_VISUAL[course.costOfLife] : undefined;

  const hasBreakdown = Boolean(
    costTuition || course.studentDormCost || course.averageRentOutsideCampus || course.intlTuitionLow || course.intlTuitionHigh
  );
  const hasMonthly = Boolean(course.monthlyHousingGbp || course.monthlyFoodGbp || course.monthlyTransportGbp);
  const isEmpty =
    !course.tuition && !course.studentDormCost && !course.averageRentOutsideCampus && !course.costOfLife && !course.monthlyTotalGbp;

  return (
    <div className="space-y-6">
      <PanelHeading>Costs &amp; Living Expenses</PanelHeading>

      {/* Every tile here is deliberately NEUTRAL. These were tone-coded
          danger/warning/success/info, which made the app editorialise about money it
          can't judge: the total read as `danger` (this price is bad), international
          tuition as `warning` and home tuition as `success` — telling this product's
          users, who ARE the international ones, that the number applying to them is a
          problem. Neutralising also fixed a real ambiguity: the two accommodation
          tiles were both `info` and so indistinguishable from each other. Identity
          comes from the label, the same rule the charts follow.

          The cost-of-living band below KEEPS its tones — HIGH/MEDIUM/LOW is a genuine
          ordinal scale, and all three remain distinct. */}
      <div className="grid gap-4 md:grid-cols-3">
        {formattedCostTuition ? (
          <MetricTile
            label={formattedDomesticTuition ? 'Intl. Tuition' : 'Annual Tuition'}
            value={formattedCostTuition}
            detail="Per year"
          />
        ) : null}
        {formattedDomesticTuition ? (
          <MetricTile label="Home Tuition" value={formattedDomesticTuition} detail="Per year" />
        ) : null}
        {totalCost ? (
          <MetricTile
            label="Total Programme Cost"
            value={formatCurrencyString(totalCost, course.currency)}
            detail={`For full ${course.duration}`}
          />
        ) : null}
        {course.studentDormCost ? (
          <MetricTile
            label="Halls of Residence"
            value={formatCurrencyString(course.studentDormCost, 'GBP')}
            detail="Per year"
          />
        ) : null}
        {course.averageRentOutsideCampus ? (
          <MetricTile
            label="Off-Campus Rent"
            value={formatCurrencyString(course.averageRentOutsideCampus, 'GBP')}
            detail="Per month (average)"
          />
        ) : null}
      </div>

      {course.costOfLife ? (
        <SectionCard title="Overall Cost of Living">
          <div className="flex items-center gap-4">
            <p
              className={cn(
                'flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold',
                band?.surface
              )}
            >
              {course.costOfLife}
            </p>
            {band ? <p className="text-sm text-muted-foreground">{band.copy}</p> : null}
          </div>
        </SectionCard>
      ) : null}

      {hasBreakdown ? (
        <SectionCard title="Estimated Annual Costs">
          <div className="space-y-4">
            {formattedCostTuition ? (
              <BreakdownRow
                label={formattedDomesticTuition ? 'Tuition (International)' : 'Tuition Fees'}
                value={formattedCostTuition}
                valueClassName="text-primary-ink"
              />
            ) : null}
            {formattedDomesticTuition ? (
              <BreakdownRow label="Tuition (Home/EU)" value={formattedDomesticTuition} valueClassName="text-success" />
            ) : null}
            {course.studentDormCost ? (
              <BreakdownRow label="Student Accommodation" value={formatCurrencyString(course.studentDormCost, 'GBP')} />
            ) : null}
            {course.averageRentOutsideCampus ? (
              <BreakdownRow
                label="Off-Campus Rent (estimated)"
                value={formatCurrencyString(course.averageRentOutsideCampus * 12, 'GBP')}
              />
            ) : null}
            {course.intlTuitionLow || course.intlTuitionHigh ? (
              <BreakdownRow
                label="University Estimate"
                valueClassName="text-primary-ink"
                value={
                  course.intlTuitionLow && course.intlTuitionHigh
                    ? `${formatCurrencyString(course.intlTuitionLow, course.currency)} – ${formatCurrencyString(course.intlTuitionHigh, course.currency)}`
                    : course.intlTuitionLow
                      ? formatCurrencyString(course.intlTuitionLow, course.currency)
                      : formatCurrencyString(course.intlTuitionHigh, course.currency)
                }
              />
            ) : null}
            {course.tuition || course.studentDormCost || course.averageRentOutsideCampus ? (
              <BreakdownRow
                total
                label="Estimated Total (per year)"
                valueClassName="text-primary-ink"
                value={formatCurrencyString(
                  numericCostTuition + (course.studentDormCost ?? 0) + (course.averageRentOutsideCampus ?? 0) * 12,
                  course.currency ?? 'GBP'
                )}
              />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {hasMonthly ? (
        <SectionCard title="Monthly Student Budget">
          <div className="space-y-4">
            {course.monthlyHousingGbp ? (
              <BreakdownRow
                label="Housing"
                value={
                  <>
                    {formatCurrencyString(course.monthlyHousingGbp, 'GBP')}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">/mo</span>
                  </>
                }
              />
            ) : null}
            {course.monthlyFoodGbp ? (
              <BreakdownRow
                label="Food & Groceries"
                value={
                  <>
                    {formatCurrencyString(course.monthlyFoodGbp, 'GBP')}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">/mo</span>
                  </>
                }
              />
            ) : null}
            {course.monthlyTransportGbp ? (
              <BreakdownRow
                label="Transport"
                value={
                  <>
                    {formatCurrencyString(course.monthlyTransportGbp, 'GBP')}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">/mo</span>
                  </>
                }
              />
            ) : null}
            {course.monthlyTotalGbp ? (
              <BreakdownRow
                total
                label="Estimated Monthly Total"
                value={formatCurrencyString(course.monthlyTotalGbp, 'GBP')}
                valueClassName="text-primary-ink"
              />
            ) : null}
            {course.annualLivingCostGbp ? (
              <div className="flex items-center justify-between gap-4 pt-2">
                <span className="text-sm text-muted-foreground">Annual living costs</span>
                <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                  {formatCurrencyString(course.annualLivingCostGbp, 'GBP')}/yr
                </span>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {course.costOverview ? (
        <SectionCard title="Cost Overview" icon={Wallet}>
          <RichText text={course.costOverview} forceBullets />
        </SectionCard>
      ) : null}

      {isEmpty ? <PanelEmpty>Cost and living expense information coming soon.</PanelEmpty> : null}
    </div>
  );
}
