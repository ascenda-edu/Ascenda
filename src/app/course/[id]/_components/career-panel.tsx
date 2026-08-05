'use client';

import { CheckCircle2, GraduationCap, MapPin } from 'lucide-react';
import { formatCurrencyString } from './course-data';
import { RichText } from './rich-text';
import { AttributeTile, MetricTile, PanelEmpty, PanelHeading, SectionCard, TagList } from './tiles';
import type { CourseView } from './types';

export function CareerPanel({ course, hasOutcomes }: { course: CourseView; hasOutcomes: boolean }) {
  const isEmpty =
    !course.graduateEmploymentRate &&
    !course.averageStartingSalary &&
    course.placementYear === null &&
    !course.topIndustries &&
    !course.studyAbroadOption &&
    !course.careerOutcomesOverview &&
    !hasOutcomes;

  return (
    <div className="space-y-6">
      <PanelHeading>Career &amp; Outcomes</PanelHeading>

      <div className="grid gap-4 md:grid-cols-3">
        {course.graduateEmploymentRate ? (
          <MetricTile
            tone="success"
            label="Graduate Employment"
            value={`${course.graduateEmploymentRate.toFixed(0)}%`}
            detail="Employed after graduation"
          />
        ) : null}
        {course.averageStartingSalary ? (
          <MetricTile
            tone="info"
            label="Avg Starting Salary"
            value={formatCurrencyString(course.averageStartingSalary, 'GBP')}
            detail="Average first-year salary"
          />
        ) : null}
        {course.placementYear !== null && course.placementYear !== undefined ? (
          <MetricTile
            tone={course.placementYear ? 'feature' : 'neutral'}
            label="Placement Year"
            value={course.placementYear ? '✓ Available' : '✗ Not offered'}
            detail="Industry work experience"
          />
        ) : null}
      </div>

      {course.careerOutcomesOverview ? (
        <SectionCard title="Career Outcomes Overview" icon={GraduationCap}>
          <RichText text={course.careerOutcomesOverview} forceBullets />
        </SectionCard>
      ) : null}

      {course.topIndustries ? (
        <SectionCard title="Top Industries for Graduates">
          <TagList value={course.topIndustries} separator={/[,;|]/} />
        </SectionCard>
      ) : null}

      {course.placementYearDetail ? (
        <SectionCard title="Placement Year Detail">
          <RichText text={course.placementYearDetail} forceBullets />
        </SectionCard>
      ) : null}

      {course.studyAbroadOption ? (
        <SectionCard title="Study Abroad Opportunities" icon={MapPin}>
          <RichText text={course.studyAbroadOption} forceBullets />
        </SectionCard>
      ) : null}

      {hasOutcomes && course.outcomes ? (
        <SectionCard title="Student Outcomes" icon={CheckCircle2}>
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
              <AttributeTile label="Avg Salary (15m)" value={formatCurrencyString(course.outcomes.salary)} />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {isEmpty ? <PanelEmpty>Career and outcomes information coming soon.</PanelEmpty> : null}
    </div>
  );
}
