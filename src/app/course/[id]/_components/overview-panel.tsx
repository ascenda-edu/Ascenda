'use client';

import type { ElementType, ReactNode } from 'react';
import Link from 'next/link';
import { CheckCircle2, GraduationCap, Landmark, Layers, ListChecks, MapPin, MoveRight, Wallet } from 'lucide-react';
import { formatCurrencyString } from './course-data';
import { RichText } from './rich-text';
import { AttributeTile, FactTile, SectionCard } from './tiles';
import type { CourseCosts, CourseTabId, CourseView } from './types';

interface OverviewPanelProps {
  course: CourseView;
  costs: CourseCosts;
  hasOutcomes: boolean;
  /** Jump to another tab — the cross-links at the bottom of this panel. */
  onNavigate: (tab: CourseTabId) => void;
}

/** A card that is really a link into another tab. */
const CrossLinkCard = ({
  title,
  icon: Icon,
  cta,
  onNavigate,
  children
}: {
  title: string;
  icon: ElementType;
  cta: string;
  onNavigate: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    onClick={onNavigate}
    className="surface-card hover-lift group block w-full text-left hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  >
    <span className="mb-4 flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Icon className="h-5 w-5 text-primary-ink" aria-hidden />
        {title}
      </span>
      <MoveRight
        className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] group-hover:translate-x-1 group-hover:opacity-100"
        aria-hidden
      />
    </span>
    {children}
    <span className="eyebrow-accent mt-4 block">{cta}</span>
  </button>
);

export function OverviewPanel({ course, costs, hasOutcomes, onNavigate }: OverviewPanelProps) {
  const { formattedCostTuition, formattedDomesticTuition, hasCostDetails } = costs;
  const hasUniversityStats = Boolean(
    course.numberOfStudents || course.studentToStaffRatio || course.nssPct || course.internationalStudentsPct
  );
  const hasCareerStats = Boolean(course.graduateEmploymentRate || course.averageStartingSalary || course.placementYear);

  return (
    <div className="space-y-6">
      <SectionCard title="Course Overview" headingAs="h2">
        <RichText text={course.summary} />
      </SectionCard>

      {course.courseRequirements ? (
        <SectionCard title="Course requirements" icon={ListChecks}>
          <RichText text={course.courseRequirements} />
        </SectionCard>
      ) : null}

      {course.careerOutcomesOverview ? (
        <SectionCard title="Career snapshot" icon={GraduationCap}>
          <RichText text={course.careerOutcomesOverview} />
        </SectionCard>
      ) : null}

      {course.studentLifeOverview ? (
        <SectionCard title="Student life" icon={Landmark}>
          <RichText text={course.studentLifeOverview} />
        </SectionCard>
      ) : null}

      {hasUniversityStats ? (
        <SectionCard title="The University at a Glance" icon={Landmark}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {course.numberOfStudents ? (
              <FactTile
                label="Student Population"
                value={course.numberOfStudents.toLocaleString()}
                labelClassName="text-primary-ink"
              />
            ) : null}
            {course.studentToStaffRatio ? (
              <FactTile
                label="Staff Ratio"
                value={`${course.studentToStaffRatio.toFixed(1)}:1`}
                labelClassName="text-primary-ink"
              />
            ) : null}
            {course.nssPct ? (
              <FactTile
                label="Satisfaction (NSS)"
                value={`${course.nssPct.toFixed(1)}%`}
                labelClassName="text-primary-ink"
              />
            ) : null}
            {course.internationalStudentsPct ? (
              <FactTile
                label="International"
                value={`${course.internationalStudentsPct.toFixed(1)}%`}
                labelClassName="text-primary-ink"
              />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {hasCareerStats ? (
        <SectionCard title="Career Prospects" icon={GraduationCap}>
          <div className="grid gap-4 sm:grid-cols-3">
            {course.graduateEmploymentRate ? (
              <FactTile
                label="Employment Rate"
                value={`${course.graduateEmploymentRate.toFixed(1)}%`}
                detail="of graduates employed"
                valueClassName="text-success"
              />
            ) : null}
            {course.averageStartingSalary ? (
              <FactTile
                label="Avg Starting Salary"
                value={new Intl.NumberFormat(undefined, {
                  style: 'currency',
                  currency: 'GBP',
                  maximumFractionDigits: 0
                }).format(course.averageStartingSalary)}
                detail="First-year earnings"
              />
            ) : null}
            {course.placementYear ? (
              <FactTile label="Placement Year" value="✓ Available" detail="Work experience option" valueClassName="text-xl" />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {hasCostDetails ? (
        <SectionCard title="Costs & Living" icon={Wallet}>
          <div className="grid gap-4 sm:grid-cols-3">
            {formattedCostTuition ? (
              <FactTile
                label={formattedDomesticTuition ? 'Intl. Tuition' : 'Annual Tuition'}
                value={formattedCostTuition}
              />
            ) : null}
            {formattedDomesticTuition ? <FactTile label="Home Tuition" value={formattedDomesticTuition} /> : null}
            {course.studentDormCost ? (
              <FactTile
                label="Halls of Residence"
                value={formatCurrencyString(course.studentDormCost, 'GBP')}
                detail="per year"
              />
            ) : null}
            {course.averageRentOutsideCampus ? (
              <FactTile
                label="Off-Campus Rent"
                value={formatCurrencyString(course.averageRentOutsideCampus, 'GBP')}
                detail="per month (avg)"
              />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {course.universityLife || course.cityLife ? (
        <div className="grid gap-4 md:grid-cols-2">
          {course.universityLife ? (
            <SectionCard title="University Life" icon={Landmark} headingClassName="text-base">
              <p className="line-clamp-3 text-sm text-muted-foreground">{course.universityLife}</p>
              <button
                type="button"
                onClick={() => onNavigate('campus')}
                className="eyebrow-accent mt-3 underline-offset-4 hover:underline"
              >
                Learn More
              </button>
            </SectionCard>
          ) : null}
          {course.cityLife ? (
            <SectionCard title="City & Location" icon={MapPin} headingClassName="text-base">
              <p className="line-clamp-3 text-sm text-muted-foreground">{course.cityLife}</p>
              <button
                type="button"
                onClick={() => onNavigate('campus')}
                className="eyebrow-accent mt-3 underline-offset-4 hover:underline"
              >
                Learn More
              </button>
            </SectionCard>
          ) : null}
        </div>
      ) : null}

      {hasOutcomes && course.outcomes ? (
        <SectionCard title="Student Outcomes & Satisfaction" icon={CheckCircle2} headingAs="h2">
          <div className="grid gap-4 sm:grid-cols-2">
            {course.outcomes.satisfaction ? (
              <AttributeTile
                label="Student Satisfaction"
                value={course.outcomes.satisfaction}
                labelClassName="text-primary-ink"
              />
            ) : null}
            {course.outcomes.employment ? (
              <AttributeTile label="Employment" value={course.outcomes.employment} />
            ) : null}
            {course.outcomes.outcomes ? <AttributeTile label="Outcomes" value={course.outcomes.outcomes} /> : null}
            {course.outcomes.salary ? (
              <AttributeTile label="Average Salary (15m)" value={formatCurrencyString(course.outcomes.salary)} />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {course.openDays && course.openDays.length > 0 ? (
        <SectionCard title="Upcoming Events" headingAs="h2">
          <ul className="space-y-3">
            {course.openDays.map((event, idx) => (
              <li key={idx} className="surface-subcard flex items-start gap-3 p-4">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{event.label}</span>
                  {event.url ? (
                    <Link
                      href={event.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-semibold text-primary-ink underline-offset-4 hover:underline"
                    >
                      View details
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <CrossLinkCard
          title="Entry Requirements"
          icon={ListChecks}
          cta="View Full Details"
          onNavigate={() => onNavigate('requirements')}
        >
          <span className="block space-y-2">
            {course.requirements.slice(0, 3).map((r, i) => (
              <span key={i} className="flex justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{r.label}</span>
                <span className="truncate font-medium text-foreground">{r.value}</span>
              </span>
            ))}
            {course.requirements.length === 0 ? (
              <span className="block text-sm text-muted-foreground">View requirements details…</span>
            ) : null}
          </span>
        </CrossLinkCard>

        <CrossLinkCard
          title="Curriculum"
          icon={Layers}
          cta="View Modules"
          onNavigate={() => onNavigate('curriculum')}
        >
          <span className="line-clamp-3 block text-sm text-muted-foreground">
            {course.modules
              ? `${course.modules.slice(0, 150)}…`
              : 'Explore the modules and subjects you will study.'}
          </span>
        </CrossLinkCard>
      </div>
    </div>
  );
}
