'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { ModuleYearSection } from './course-data';
import { emphasize } from './rich-text';
import { PanelEmpty, PanelHeading } from './tiles';

const FLAT_MODULE_PREVIEW = 9;
/** Above this many flat modules the panel offers a show-all toggle. */
const FLAT_MODULE_TOGGLE_THRESHOLD = 8;

interface CurriculumPanelProps {
  /** Modules grouped into "Year N" blocks, when the copy gives us years. */
  yearSections: ModuleYearSection[];
  /** Flat module list, used when no year structure could be parsed. */
  moduleItems: string[];
}

export function CurriculumPanel({ yearSections, moduleItems }: CurriculumPanelProps) {
  const [showAllFlat, setShowAllFlat] = useState(false);
  const showToggle = moduleItems.length > FLAT_MODULE_TOGGLE_THRESHOLD && !yearSections.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PanelHeading>Course Curriculum</PanelHeading>
        {showToggle ? (
          <Button variant="outline" size="sm" onClick={() => setShowAllFlat(!showAllFlat)}>
            {showAllFlat ? 'Show Less' : 'Show All'}
          </Button>
        ) : null}
      </div>

      {yearSections.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {yearSections.map((section, idx) => (
            <section key={idx} className="surface-card p-0">
              <h3 className="flex items-center gap-3 border-b border-border/40 bg-muted/30 px-5 py-4 text-lg font-semibold text-foreground">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary-ink"
                  aria-hidden
                >
                  {section.yearNum ?? idx + 1}
                </span>
                {section.title}
              </h3>
              <ul className="divide-y divide-border/40">
                {section.items.map((item, i) => (
                  <li key={i} className="flex items-start gap-3 p-4 transition-colors hover:bg-muted/20">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    <span className="text-sm leading-relaxed text-foreground/80">{emphasize(item)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : moduleItems.length ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(showAllFlat ? moduleItems : moduleItems.slice(0, FLAT_MODULE_PREVIEW)).map((item, idx) => (
            <li key={idx} className="surface-subcard flex items-start gap-3">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span className="text-sm font-medium leading-relaxed text-foreground/90">{emphasize(item)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <PanelEmpty>No specific curriculum modules available for this course.</PanelEmpty>
      )}
    </div>
  );
}
