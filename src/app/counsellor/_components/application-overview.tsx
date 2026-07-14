'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutGrid, List, ChevronRight, Filter } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { parseLocalDate } from '@/lib/utils/dates';
import { stagger, cardFade } from '@/lib/motion';
import type { ApplicationStatus, ApplicationPlatform, EnrichedApplication } from '@/lib/counsellor/types';
import { STAGE_COLORS } from '@/lib/counsellor/stage-colors';

const PLATFORM_COLORS: Record<string, string> = {
  UCAS: 'bg-primary/10 text-primary',
  'Common App': 'bg-emerald-500/10 text-emerald-600',
  Direct: 'bg-amber-500/10 text-amber-600',
  Coalition: 'bg-sky-500/10 text-sky-600',
  OUAC: 'bg-rose-500/10 text-rose-600',
};

const dateFormatter = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

const STATUSES: ApplicationStatus[] = ['planning', 'in_progress', 'submitted', 'decision'];

export function ApplicationOverview({ apps }: { apps: EnrichedApplication[] }) {
  const allApps = apps;
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [filterPlatform, setFilterPlatform] = useState<ApplicationPlatform | null>(null);
  const [searchStudent, setSearchStudent] = useState('');

  const platforms = useMemo(() => [...new Set(allApps.map((a) => a.platform))], [allApps]);

  const filtered = useMemo(() => {
    let result = [...allApps];
    if (filterPlatform) result = result.filter((a) => a.platform === filterPlatform);
    if (searchStudent) result = result.filter((a) => a.studentName.toLowerCase().includes(searchStudent.toLowerCase()));
    return result;
  }, [allApps, filterPlatform, searchStudent]);

  // Platform summary
  const platformCounts = useMemo(() => {
    const map = new Map<string, number>();
    allApps.forEach((a) => map.set(a.platform, (map.get(a.platform) ?? 0) + 1));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [allApps]);

  // Group by status for kanban; within each status, group by student
  const columns = useMemo(() => {
    const map: Record<ApplicationStatus, EnrichedApplication[]> = { planning: [], in_progress: [], submitted: [], decision: [] };
    filtered.forEach((a) => map[a.status].push(a));
    return map;
  }, [filtered]);

  // Per-column: unique students with all their apps in that stage
  const kanbanByStudent = useMemo(() => {
    const result: Record<ApplicationStatus, { studentId: string; studentName: string; flagEmoji: string; apps: EnrichedApplication[] }[]> = {
      planning: [], in_progress: [], submitted: [], decision: []
    };
    (Object.keys(columns) as ApplicationStatus[]).forEach((status) => {
      const seen = new Map<string, typeof result[ApplicationStatus][number]>();
      columns[status].forEach((app) => {
        if (!seen.has(app.studentId)) {
          seen.set(app.studentId, { studentId: app.studentId, studentName: app.studentName, flagEmoji: app.flagEmoji, apps: [] });
        }
        seen.get(app.studentId)!.apps.push(app);
      });
      result[status] = [...seen.values()];
    });
    return result;
  }, [columns]);

  return (
    <div className="space-y-6">
      {/* Platform summary */}
      <div className="flex flex-wrap gap-3">
        {platformCounts.map(([platform, count]) => (
          <div key={platform} className="surface-subcard px-4 py-2 text-center">
            <p className="text-lg font-bold text-foreground">{count}</p>
            <p className="text-xs text-muted-foreground">{platform}</p>
          </div>
        ))}
        <div className="surface-subcard px-4 py-2 text-center">
          <p className="text-lg font-bold text-foreground">{allApps.length}</p>
          <p className="text-xs text-muted-foreground">Total applications</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 surface-subcard p-1 rounded-xl">
          <button onClick={() => setView('kanban')} aria-pressed={view === 'kanban'} className={cn('rounded-lg px-3 py-1 text-xs font-medium transition-colors', view === 'kanban' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <LayoutGrid className="h-3.5 w-3.5 inline mr-1" /> Kanban
          </button>
          <button onClick={() => setView('list')} aria-pressed={view === 'list'} className={cn('rounded-lg px-3 py-1 text-xs font-medium transition-colors', view === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
            <List className="h-3.5 w-3.5 inline mr-1" /> List
          </button>
        </div>

        <label htmlFor="application-overview-search" className="sr-only">
          Search by student name
        </label>
        <input
          id="application-overview-search"
          type="text"
          placeholder="Search student..."
          value={searchStudent}
          onChange={(e) => setSearchStudent(e.target.value)}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring w-40"
        />

        {platforms.map((p) => (
          <button
            key={p}
            onClick={() => setFilterPlatform(filterPlatform === p ? null : p)}
            aria-pressed={filterPlatform === p}
            className={cn('rounded-full px-3 py-1 text-xs font-medium transition-colors', filterPlatform === p ? 'bg-primary text-primary-foreground' : 'bg-muted/50 text-muted-foreground hover:bg-muted')}
          >{p}</button>
        ))}
      </div>

      {/* Kanban view — one card per student, apps listed inside */}
      {view === 'kanban' && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((status) => {
            const cfg = STAGE_COLORS[status];
            const studentGroups = kanbanByStudent[status];
            return (
              <div key={status} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className={cn('text-sm font-semibold', cfg.text)}>{cfg.label}</h3>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', cfg.bg, cfg.text)}>
                    {studentGroups.length} student{studentGroups.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <motion.div className="space-y-2" variants={stagger} initial="hidden" animate="show">
                  {studentGroups.map(({ studentId, studentName, flagEmoji, apps }) => (
                    <motion.div key={studentId} variants={cardFade}>
                      <Link
                        href={`/counsellor/students/${studentId}`}
                        className={cn('block surface-subcard p-3 border-l-4 transition-colors hover:bg-muted/30 group', cfg.borderLeft)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm" role="img" aria-label={`${studentName}'s flag`}>{flagEmoji}</span>
                              <span className="text-sm font-semibold text-foreground truncate">{studentName}</span>
                            </div>
                            <div className="mt-1.5 space-y-0.5">
                              {apps.map((app) => (
                                <div key={`${app.university}-${app.program}`} className="flex items-center gap-1.5 text-[11px]">
                                  <span className="truncate text-muted-foreground">{app.university}</span>
                                  <span className={cn('shrink-0 rounded-full px-1.5 py-0 text-[9px] font-semibold', PLATFORM_COLORS[app.platform] ?? 'bg-muted/50 text-muted-foreground')}>{app.platform}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground shrink-0 mt-1 ml-2" />
                        </div>
                        {apps.length > 1 && (
                          <p className="mt-1.5 text-[10px] text-muted-foreground">{apps.length} applications</p>
                        )}
                      </Link>
                    </motion.div>
                  ))}
                  {studentGroups.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">No applications</p>
                  )}
                </motion.div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="text-left py-2 pr-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Student</th>
                <th scope="col" className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">University</th>
                <th scope="col" className="text-left py-2 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Programme</th>
                <th scope="col" className="text-center py-2 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Platform</th>
                <th scope="col" className="text-center py-2 px-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Status</th>
                <th scope="col" className="text-left py-2 pl-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((app) => {
                const cfg = STAGE_COLORS[app.status];
                return (
                  <tr key={`${app.studentId}-${app.university}-${app.program}`} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 pr-3">
                      <Link href={`/counsellor/students/${app.studentId}`} className="font-medium text-foreground hover:text-primary">
                        <span role="img" aria-label={`${app.studentName}'s flag`}>{app.flagEmoji}</span> {app.studentName}
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">{app.university}</td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground">{app.program}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-semibold', PLATFORM_COLORS[app.platform] ?? 'bg-muted/50 text-muted-foreground')}>{app.platform}</span>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', cfg.bg, cfg.text)}>{cfg.label}</span>
                    </td>
                    <td className="py-2.5 pl-3 text-xs text-muted-foreground">{dateFormatter.format(parseLocalDate(app.deadline))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No applications match your filters.</p>}
        </div>
      )}
    </div>
  );
}
