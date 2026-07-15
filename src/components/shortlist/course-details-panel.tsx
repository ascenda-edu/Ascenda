'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { NotebookPen } from 'lucide-react';
import { cn } from '@/lib/utils';

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
      <div className="rounded-[28px] border border-dashed border-border bg-muted/70 p-8 text-center">
        <p className="text-lg font-semibold text-foreground">No courses selected yet</p>
        <p className="text-sm text-muted-foreground">Add programs to your shortlist from search or matches to see details here.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.38fr,1fr]">
      <div className="rounded-[28px] border border-border bg-card p-4 transition-colors">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Select a course</p>
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
                    ? 'border-foreground bg-card shadow-[0_18px_40px_rgba(15,23,42,0.12)]'
                    : 'border-border bg-muted/70 hover:border-muted-foreground hover:bg-card'
                )}
              >
                <p className="text-xs uppercase tracking-[0.4em] text-muted-foreground">{course.university}</p>
                <p className="text-sm font-semibold text-foreground">{course.program}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{course.location}</span>
                  <span className="font-semibold text-foreground">{course.fitScore}% fit</span>
                </div>
                <p className="mt-1 text-[0.65rem] uppercase tracking-[0.35em] text-muted-foreground">{course.stage}</p>
              </button>
            );
          })}
        </div>
      </div>
      {activeCourse ? (
        <article className="flex flex-col gap-4 rounded-[28px] border border-border bg-card p-5 shadow-[0_20px_55px_rgba(15,23,42,0.08)] transition-colors">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">{activeCourse.university}</p>
              <h3 className="text-2xl font-semibold text-foreground">{activeCourse.program}</h3>
              <p className="text-sm text-muted-foreground">{activeCourse.location}</p>
            </div>
            <div className="rounded-2xl bg-card px-4 py-2 text-right shadow-sm">
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Fit</p>
              <p className="text-2xl font-semibold text-foreground">{activeCourse.fitScore}%</p>
              <p className="text-xs text-muted-foreground">{activeCourse.stage}</p>
            </div>
            <Link
              href={`/course/${activeCourse.id}`}
              className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-600 underline-offset-4 hover:underline"
            >
              Open course page
            </Link>
          </div>
          <div className="rounded-[26px] border border-border bg-card p-4">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Modules</p>
            <ul className="mt-3 space-y-3">
              {activeCourse.modules.map((module) => (
                <li key={module.name} className="rounded-2xl border border-border bg-muted/60 px-4 py-3 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground">{module.name}</p>
                    <span className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">{module.credits}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{module.highlight}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 text-sm text-muted-foreground sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card px-3 py-2">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Tutorials</p>
              <p className="font-semibold text-foreground">{activeCourse.schedule.tutorials}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-3 py-2">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Seminars / studios</p>
              <p className="font-semibold text-foreground">{activeCourse.schedule.seminars}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card px-3 py-2">
              <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Assessments</p>
              <p className="font-semibold text-foreground">{activeCourse.schedule.assessments}</p>
            </div>
          </div>
          <div className="rounded-[26px] border border-dashed border-border bg-muted/70 p-4">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Immersion</p>
            <p className="text-sm text-muted-foreground">{activeCourse.immersion}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <NotebookPen className="h-4 w-4 text-indigo-500" aria-hidden />
            <p className="font-semibold text-foreground">Next action:</p>
            <p>{activeCourse.nextAction}</p>
          </div>
        </article>
      ) : null}
    </div>
  );
};
