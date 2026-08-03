import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PageHero } from '@/components/layout/page-hero';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ListChecks } from 'lucide-react';
import {
  CrossApplicationTasks,
  type SeedTask,
  type TaskApplicationOption
} from '@/components/applications/cross-application-tasks';
import { loadApplicationsWithTasks } from '@/lib/data/applications';
import type { ApplicationTasksRow } from '@/lib/data/columns';

export const metadata: Metadata = {
  title: 'Tasks'
};

export default async function TasksPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Ordered by id inside the loader, so the "(1)"/"(2)" label-collision
  // suffixes below cannot swap which application they denote between refreshes.
  // A failed query hits the error boundary (unwrap) — rendering the "No tasks
  // yet" empty state to a user who has tasks is worse than an error page.
  const apps = await loadApplicationsWithTasks(supabase, user.id);

  // Two applications at the same university would otherwise share a label —
  // merging their task groups and rendering identical <select> options. Prefer
  // "University — Programme" for collisions; number anything that still
  // collides (same programme twice, or no programme name to disambiguate with).
  const uniCounts = new Map<string, number>();
  for (const app of apps) {
    const uni = app.program?.universities?.name;
    if (uni) uniCounts.set(uni, (uniCounts.get(uni) ?? 0) + 1);
  }
  const baseLabel = (app: ApplicationTasksRow) => {
    const uni = app.program?.universities?.name;
    const programme = app.program?.name;
    if (uni && programme && (uniCounts.get(uni) ?? 0) > 1) return `${uni} — ${programme}`;
    return uni ?? programme ?? 'Application';
  };
  const labelCounts = new Map<string, number>();
  for (const app of apps) {
    const base = baseLabel(app);
    labelCounts.set(base, (labelCounts.get(base) ?? 0) + 1);
  }
  const labelsUsed = new Map<string, number>();
  const labelById = new Map<string, string>();
  for (const app of apps) {
    const base = baseLabel(app);
    if ((labelCounts.get(base) ?? 0) > 1) {
      const n = (labelsUsed.get(base) ?? 0) + 1;
      labelsUsed.set(base, n);
      labelById.set(app.id, `${base} (${n})`);
    } else {
      labelById.set(app.id, base);
    }
  }
  const appLabel = (app: ApplicationTasksRow) => labelById.get(app.id) ?? 'Application';

  const applicationOptions: TaskApplicationOption[] = apps.map((app) => ({
    id: app.id,
    label: appLabel(app)
  }));

  const seed: SeedTask[] = [];
  for (const app of apps) {
    const label = appLabel(app);
    for (const item of app.application_checklist ?? []) {
      seed.push({
        id: item.id,
        name: item.task_name,
        status: item.status,
        dueDate: item.due_date ?? undefined,
        group: label,
        applicationId: app.id
      });
    }
  }

  return (
    <>
      <PageHero
        tone="student"
        eyebrow="Tasks"
        title="Everything still to do"
        description="Action items across all your applications. Mark them off as you go — changes save to your applications."
        breadcrumbs={<Breadcrumbs />}
      />
      {applicationOptions.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title="No tasks yet — start an application"
          description="Add a program from your shortlist and its requirements become trackable tasks here."
          action={
            <Button asChild size="sm">
              <Link href="/university-search/shortlist">Add from shortlist</Link>
            </Button>
          }
        />
      ) : (
        <CrossApplicationTasks initialTasks={seed} applicationOptions={applicationOptions} />
      )}
    </>
  );
}
