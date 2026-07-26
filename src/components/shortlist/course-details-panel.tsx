'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { GraduationCap, NotebookPen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';

interface CourseModule {
  name: string;
  credits: string;
  highlight: string;
}

interface CourseSchedule {
  tutorials: string;
  seminars: string;
  assessments: string;
}

export interface ShortlistCourse {
  id: string;
  university: string;
  program: string;
  location: string;
  fitScore: number;
  stage: string;
  nextAction: string;
  modules: CourseModule[];
  immersion: string;
  schedule: CourseSchedule;
}

export const CourseDetailsPanel = ({ courses }: { courses: ShortlistCourse[] }) => {
  const [activeId, setActiveId] = useState(() => courses[0]?.id ?? null);

  const activeCourse = useMemo(() => courses.find((course) => course.id === activeId), [courses, activeId]);

  if (courses.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="No courses selected yet"
        description="Add programs to your shortlist from search or matches to see details here."
      />
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.38fr,1fr]">
      <div className="rounded-4xl border border-border bg-card p-4 transition-colors">
        <p className="eyebrow">Select a course</p>
        <div className="mt-4 space-y-3">
          {courses.map((course) => {
            const isActive = activeCourse?.id === course.id;
            return (
              <button
                key={course.id}
                type="button"
                onClick={() => setActiveId(course.id)}
                className={cn(
                  'w-full rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'border-foreground bg-card shadow-e-3'
                    : 'border-border bg-muted/70 hover:border-muted-foreground hover:bg-card'
                )}
              >
                <p className="eyebrow">{course.university}</p>
                <p className="text-sm font-semibold text-foreground">{course.program}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{course.location}</span>
                  <span className="font-semibold text-foreground">{course.fitScore}% fit</span>
                </div>
                <p className="eyebrow mt-1">{course.stage}</p>
              </button>
            );
          })}
        </div>
      </div>
      {activeCourse ? (
        <article className="flex flex-col gap-4 rounded-4xl border border-border bg-card p-5 shadow-e-3 transition-colors">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="eyebrow">{activeCourse.university}</p>
              <h3 className="text-2xl font-semibold text-foreground">{activeCourse.program}</h3>
              <p className="text-sm text-muted-foreground">{activeCourse.location}</p>
            </div>
            <div className="rounded-2xl bg-card px-4 py-2 text-right shadow-e-1">
              <p className="eyebrow">Fit</p>
              <p className="text-2xl font-semibold text-foreground">{activeCourse.fitScore}%</p>
              <p className="text-xs text-muted-foreground">{activeCourse.stage}</p>
            </div>
            <Link
              href={`/course/${activeCourse.id}`}
              className="eyebrow-accent underline-offset-4 hover:underline"
            >
              Open course page
            </Link>
          </div>
          <div className="rounded-3xl border border-border bg-card p-4">
            <p className="eyebrow">Modules</p>
            <ul className="mt-3 space-y-3">
              {activeCourse.modules.map((module) => (
                <li key={module.name} className="rounded-2xl border border-border bg-muted/60 px-4 py-3 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{module.name}</p>
                    <span className="eyebrow">{module.credits}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{module.highlight}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card px-3 py-2">
              <p className="eyebrow">Tutorials</p>
              <p className="font-semibold text-foreground">{activeCourse.schedule.tutorials}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-3 py-2">
              <p className="eyebrow">Seminars / studios</p>
              <p className="font-semibold text-foreground">{activeCourse.schedule.seminars}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-3 py-2">
              <p className="eyebrow">Assessments</p>
              <p className="font-semibold text-foreground">{activeCourse.schedule.assessments}</p>
            </div>
          </div>
          <div className="rounded-3xl border border-dashed border-border bg-muted/70 p-4">
            <p className="eyebrow">Immersion</p>
            <p className="text-sm text-muted-foreground">{activeCourse.immersion}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <NotebookPen className="h-4 w-4 text-primary-ink" aria-hidden />
            <p className="font-semibold text-foreground">Next action:</p>
            <p>{activeCourse.nextAction}</p>
          </div>
        </article>
      ) : null}
    </div>
  );
};
