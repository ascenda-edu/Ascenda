'use client';

import { Landmark, MapPin } from 'lucide-react';
import { RichText } from './rich-text';
import { AttributeTile, BreakdownRow, MetricTile, PanelEmpty, PanelHeading, SectionCard, TagList } from './tiles';
import type { CourseView } from './types';

export function CampusPanel({ course }: { course: CourseView }) {
  const hasStats = Boolean(
    course.numberOfStudents || course.studentToStaffRatio || course.nssPct || course.internationalStudentsPct
  );
  const hasAttributes = Boolean(
    course.universityLife || course.cityLife || course.climate || course.safety || course.transportAccessibility
  );
  const isEmpty =
    !course.universityLife &&
    !course.studentLifeOverview &&
    !course.culturalSocialEnvironment &&
    !course.cityLife &&
    !course.numberOfStudents;

  return (
    <div className="space-y-6">
      <PanelHeading>Campus &amp; City Life</PanelHeading>

      {hasStats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {course.numberOfStudents ? (
            <MetricTile
              tone="primary"
              label="Student Population"
              value={course.numberOfStudents.toLocaleString()}
              detail="Total students"
            />
          ) : null}
          {course.studentToStaffRatio ? (
            <MetricTile
              tone="info"
              label="Staff Ratio"
              value={`${course.studentToStaffRatio.toFixed(0)}:1`}
              detail="Students per staff"
            />
          ) : null}
          {course.nssPct ? (
            <MetricTile
              tone="success"
              label="Satisfaction (NSS)"
              value={`${course.nssPct.toFixed(0)}%`}
              detail="Student satisfaction"
            />
          ) : null}
          {course.internationalStudentsPct ? (
            <MetricTile
              tone="warning"
              label="International Students"
              value={`${course.internationalStudentsPct.toFixed(0)}%`}
              detail="Of student body"
            />
          ) : null}
        </div>
      ) : null}

      {hasAttributes || course.culturalSocialEnvironment ? (
        <SectionCard title="Campus at a Glance" icon={Landmark}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {course.universityLife ? (
              <AttributeTile label="Campus Type" value={course.universityLife} labelClassName="text-primary-ink" />
            ) : null}
            {course.cityLife ? <AttributeTile label="City Size" value={course.cityLife} /> : null}
            {course.climate ? <AttributeTile label="Climate" value={course.climate} /> : null}
            {course.safety ? <AttributeTile label="Safety Index" value={`${course.safety}/10`} /> : null}
            {course.transportAccessibility ? (
              <AttributeTile label="Transport" value={course.transportAccessibility} />
            ) : null}
            {course.culturalSocialEnvironment ? (
              <AttributeTile label="Social Scene" value={course.culturalSocialEnvironment} />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {course.studentLifeOverview ? (
        <SectionCard title="Student Life & City" icon={MapPin}>
          <RichText text={course.studentLifeOverview} forceBullets />
        </SectionCard>
      ) : null}

      {course.studentLifeTags ? (
        <SectionCard title="What Students Love">
          <TagList value={course.studentLifeTags} separator={/[,;|]+/} />
        </SectionCard>
      ) : null}

      {hasStats ? (
        <SectionCard title="University Stats">
          <div className="space-y-4">
            {course.numberOfStudents ? (
              <BreakdownRow label="Total Students" value={course.numberOfStudents.toLocaleString()} valueClassName="text-primary-ink" />
            ) : null}
            {course.studentToStaffRatio ? (
              <BreakdownRow label="Student-to-Staff Ratio" value={`${course.studentToStaffRatio.toFixed(0)}:1`} />
            ) : null}
            {course.nssPct ? (
              <BreakdownRow label="NSS Student Satisfaction" value={`${course.nssPct.toFixed(0)}%`} valueClassName="text-success" />
            ) : null}
            {course.internationalStudentsPct ? (
              <BreakdownRow label="International Students" value={`${course.internationalStudentsPct.toFixed(0)}%`} />
            ) : null}
            {course.safety ? <BreakdownRow label="Safety Index" value={`${course.safety}/10`} /> : null}
          </div>
        </SectionCard>
      ) : null}

      {isEmpty ? <PanelEmpty>Campus and student life information coming soon.</PanelEmpty> : null}
    </div>
  );
}
