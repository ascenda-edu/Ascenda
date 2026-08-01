'use client';

import type { ReactNode } from 'react';
import { BookOpen, GraduationCap, Landmark, Layers, ListChecks, ShieldCheck, Wallet } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CourseTabId } from './types';

export const COURSE_TABS: { id: CourseTabId; label: string; icon: typeof BookOpen }[] = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'curriculum', label: 'Curriculum', icon: Layers },
  { id: 'requirements', label: 'Requirements', icon: ListChecks },
  { id: 'assessment', label: 'Assessment', icon: ShieldCheck },
  { id: 'campus', label: 'Campus & City Life', icon: Landmark },
  { id: 'career', label: 'Career', icon: GraduationCap },
  { id: 'costs', label: 'Costs', icon: Wallet }
];

export const COURSE_TAB_IDS = COURSE_TABS.map((t) => t.id);

/**
 * `top-20 sm:top-24` clears the fixed navbar (~100px from `sm` up) — the same
 * offset `SearchToolbar` uses. The old bar was `sticky top-0`, which was only
 * correct because the page had opted out of the app shell and had no navbar
 * above it to collide with.
 */
const STICKY = 'sticky top-20 z-sticky sm:top-24';

/**
 * The tab set, on Radix.
 *
 * The hand-rolled version had `role="tablist"` / `role="tab"` on plain buttons
 * with a single shared `aria-controls="course-tabpanel"` pointing at one div,
 * no `role="tabpanel"` per panel and no arrow-key handling — so a screen reader
 * was told there were seven tabs controlling one region, and a keyboard user had
 * to tab through all seven to reach the content. Radix wires
 * tablist/tab/tabpanel, `aria-controls`/`aria-labelledby` per pair, roving
 * tabindex and Home/End/arrow navigation; our `<TabsList>`/`<TabsTrigger>`
 * supply the section-nav look and the sliding `layoutId` indicator.
 */
export function CourseTabs({
  value,
  onValueChange,
  panels
}: {
  value: CourseTabId;
  onValueChange: (next: CourseTabId) => void;
  panels: Record<CourseTabId, ReactNode>;
}) {
  return (
    <Tabs value={value} onValueChange={(next) => onValueChange(next as CourseTabId)}>
      <TabsList aria-label="Course sections" className={STICKY}>
        {COURSE_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <TabsTrigger key={tab.id} value={tab.id}>
              <span className="inline-flex items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {tab.label}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>

      {/* min-h keeps the sticky bar from jumping up the page when you switch from
          a long panel to a short one. */}
      {COURSE_TABS.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="min-h-[30rem]">
          {panels[tab.id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
