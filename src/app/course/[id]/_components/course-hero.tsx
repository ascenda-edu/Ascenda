'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, GraduationCap } from 'lucide-react';
import { PageHero } from '@/components/layout/page-hero';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import type { CourseView } from './types';

type ActionButton = {
  key: string;
  href: string;
  label: string;
  variant: 'outline' | 'default';
  priority: number;
};

/**
 * Apply > Visit > Course Site, de-duplicated by href: a lot of catalogue rows
 * put the same URL in `provider_apply_url` and `provider_course_url`, and the
 * page used to render it two or three times under different labels.
 */
export const buildActionButtons = (course: CourseView | null): ActionButton[] => {
  if (!course) return [];

  const buttons: ActionButton[] = [];

  if (course.applyUrl) {
    buttons.push({ key: 'apply', href: course.applyUrl.trim(), label: 'Apply Now', variant: 'default', priority: 3 });
  }

  if (course.courseUrl) {
    buttons.push({ key: 'visit', href: course.courseUrl.trim(), label: 'Visit Website', variant: 'outline', priority: 2 });
    buttons.push({ key: 'course', href: course.courseUrl.trim(), label: 'Course Site', variant: 'outline', priority: 1 });
  }

  const seen = new Map<string, ActionButton>();
  buttons.forEach((btn) => {
    const existing = seen.get(btn.href);
    if (!existing || btn.priority > existing.priority) {
      seen.set(btn.href, btn);
    }
  });

  return Array.from(seen.values());
};

/**
 * The university crest. Kept on an opaque dark plate: a good share of these are
 * white-on-transparent PNGs served straight from the provider, so a
 * theme-following surface loses half of them in one mode or the other. `alt=""`
 * because the university's name is already the hero's eyebrow — announcing
 * "Foo University logo" straight after it is duplicate content for a screen
 * reader.
 */
const CrestMark = ({ course }: { course: CourseView }) =>
  course.logoUrl ? (
    <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-border bg-black">
      <Image src={course.logoUrl} alt="" fill className="object-contain" sizes="40px" />
    </span>
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground">
      <GraduationCap className="h-5 w-5" aria-hidden />
    </span>
  );

interface CourseHeroProps {
  course: CourseView;
  backHref: string;
  backLabel: string;
  /** True when we arrived from the results page, so "back" is a history step. */
  fromSearch: boolean;
  onBackToResults: () => void;
}

/**
 * The page header, now `<PageHero>` like every other logged-in page.
 *
 * It used to be a bespoke full-bleed band — its own gradient, its own
 * `max-w-6xl` gutter (the shell's is `max-w-[120rem]` + `shell-gutter`), its own
 * `<Breadcrumbs>` placement, and an h1 that had been marketing-scale
 * (`text-4xl sm:text-5xl lg:text-6xl`) before an earlier pass stripped it back
 * to a bare `font-bold` with no size at all. PageHero settles all of that: 22px
 * → 24px semibold, eyebrow, description, breadcrumbs slot, actions slot.
 */
export function CourseHero({ course, backHref, backLabel, fromSearch, onBackToResults }: CourseHeroProps) {
  const actionButtons = buildActionButtons(course);
  const description = [course.location, course.ucasCode ? `UCAS ${course.ucasCode}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <PageHero
      tone="student"
      eyebrow={course.university}
      breadcrumbs={<Breadcrumbs />}
      title={
        <span className="flex items-center gap-3">
          <CrestMark course={course} />
          <span className="min-w-0">{course.title}</span>
        </span>
      }
      description={description}
      actions={
        <>
          {fromSearch ? (
            <Button variant="ghost" size="sm" onClick={onBackToResults}>
              <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
              {backLabel}
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href={backHref}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
                {backLabel}
              </Link>
            </Button>
          )}
          {actionButtons.map((action) => (
            <Button key={action.key} asChild size="sm" variant={action.variant}>
              <Link href={action.href} target="_blank" rel="noreferrer">
                {action.label}
              </Link>
            </Button>
          ))}
        </>
      }
    />
  );
}

/**
 * The highlights bar under the hero. `surface-stat` tiles rather than a
 * hand-rolled `rounded-2xl border-border/60 bg-card/50` copy of one, and the
 * label is the `eyebrow` class rather than a fourth spelling of it.
 */
export function CourseQuickFacts({ course }: { course: CourseView }) {
  if (!course.quickFacts.length) return null;

  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {course.quickFacts.map((fact) => {
        const Icon = fact.icon;
        return (
          <li key={fact.label} className="surface-stat flex items-start gap-3 p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="eyebrow">{fact.label}</p>
              <p className="truncate text-sm font-semibold text-foreground" title={fact.value}>
                {fact.value}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
