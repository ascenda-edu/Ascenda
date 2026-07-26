import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { SectionNav } from '@/components/layout/section-nav';
import { ADMIN_SECTION_ITEMS } from '@/components/layout/navigation';
import { FlaskConical } from 'lucide-react';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';

export const metadata: Metadata = { title: 'Algorithm Simulation — Admin' };

type SimRow = {
  id: string;
  run_id: string;
  batch_label: string;
  profile_name: string;
  programme_type: string;
  student_ib_equivalent: number | null;
  student_score: number | null;
  student_band: string | null;
  actual_university: string;
  actual_program: string;
  actual_country: string;
  algorithm_result: string | null;
  chance_percent: number | null;
  validation_pass: boolean | null;
  algorithm_notes: string | null;
  created_at: string;
};

type BatchSummary = {
  batch_label: string;
  run_id: string;
  total: number;
  passed: number;
  passRate: number;
  created_at: string;
  rows: SimRow[];
};

function tierColor(result: string | null) {
  if (!result) return 'bg-muted text-muted-foreground';
  if (result === 'Safety') return 'bg-success-subtle text-success';
  if (result === 'Target') return 'bg-info-subtle text-info';
  if (result === 'Reach') return 'bg-warning-subtle text-warning';
  if (result.startsWith('Best:')) return 'bg-feature-subtle text-feature';
  return 'bg-danger-subtle text-danger';
}

// The tone system has five steps, so the old orange 'Borderline' step folds onto
// danger — the band name is printed next to the colour, so no information is lost.
function bandColor(band: string | null) {
  if (!band) return 'text-muted-foreground';
  if (band === 'Exceptional') return 'text-feature font-semibold';
  if (band === 'Very strong') return 'text-info font-semibold';
  if (band === 'Strong') return 'text-success';
  if (band === 'Solid') return 'text-warning';
  if (band === 'Borderline') return 'text-danger';
  return 'text-danger';
}

export default async function SimulationPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/dashboard');

  const { data: rows } = await (supabase as any)
    .from('simulation_results')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500) as { data: SimRow[] | null };

  const allRows = rows ?? [];

  // Group by run_id, pick latest run per batch_label
  const runMap = new Map<string, BatchSummary>();
  allRows.forEach(row => {
    if (!runMap.has(row.run_id)) {
      runMap.set(row.run_id, {
        batch_label: row.batch_label,
        run_id: row.run_id,
        total: 0, passed: 0, passRate: 0,
        created_at: row.created_at,
        rows: [],
      });
    }
    const batch = runMap.get(row.run_id)!;
    batch.rows.push(row);
    batch.total++;
    if (row.validation_pass) batch.passed++;
  });

  runMap.forEach(b => {
    b.passRate = Math.round((b.passed / b.total) * 100);
  });

  const batches = Array.from(runMap.values())
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <DashboardShell>
      <SectionNav items={ADMIN_SECTION_ITEMS} />
      <PageHero
        tone="counsellor"
        eyebrow="Admin"
        title="Algorithm simulation"
        description="Validates scoring + matching against real-world admission outcomes. A PASS means the algorithm classified the student's actual school as Safety, Target, or Reach."
        breadcrumbs={<Breadcrumbs />}
        stats={[{ label: 'Runs recorded', value: String(batches.length) }]}
      />
      <div className="space-y-10">
        {batches.length === 0 && (
          <EmptyState
            icon={<FlaskConical />}
            title="No simulation results yet"
            description="Run a batch to validate the scoring and matching algorithm against real admission outcomes."
            hint="npx tsx scripts/simulate-profiles.ts batch_10"
          />
        )}

        {batches.map(batch => (
          <div key={batch.run_id} className="space-y-4">
            {/* Batch header */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="font-heading text-lg font-semibold capitalize tracking-tight text-foreground">
                {batch.batch_label.replace('_', ' ')}
              </h2>
              <span className="text-sm text-muted-foreground">
                {new Date(batch.created_at).toLocaleString()} · run {batch.run_id.slice(0, 8)}
              </span>
              <div className={`ml-auto flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold tabular-nums
                ${batch.passRate >= 80 ? 'bg-success-subtle text-success' :
                  batch.passRate >= 60 ? 'bg-warning-subtle text-warning' : 'bg-danger-subtle text-danger'}`}>
                {batch.passed}/{batch.total} pass · {batch.passRate}%
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total profiles', value: batch.total },
                { label: 'Pass rate', value: `${batch.passRate}%` },
                { label: 'Safety / Target', value: batch.rows.filter(r => r.algorithm_result === 'Safety' || r.algorithm_result === 'Target').length },
                { label: 'Reach', value: batch.rows.filter(r => r.algorithm_result === 'Reach').length },
              ].map(stat => (
                <div key={stat.label} className="surface-stat p-4 sm:p-4">
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Findings */}
            {batch.rows.filter(r => !r.validation_pass).length > 0 && (
              <div className="rounded-lg bg-warning-subtle border border-warning/25 px-4 py-3">
                <p className="text-sm font-medium text-warning mb-1">
                  ⚠ Failures ({batch.rows.filter(r => !r.validation_pass).length}) — Algorithm calibration findings:
                </p>
                {batch.rows.filter(r => !r.validation_pass).map(r => (
                  <p key={r.id} className="text-xs text-warning">
                    • <strong>{r.profile_name}</strong> (IB equiv {r.student_ib_equivalent}) →{' '}
                    {r.actual_university}: result was <em>{r.algorithm_result ?? 'Not found'}</em>
                  </p>
                ))}
              </div>
            )}

            {/* Results table. The `Table` primitive keeps a min-width floor, so
                on a narrow viewport these nine columns scroll instead of being
                crushed into slivers; the card is the surface (a table is content,
                not a card) with its own padding zeroed so rows run edge to edge. */}
            <div className="surface-card !p-0">
              <Table className="min-w-[60rem]" containerClassName="max-h-[70vh]">
                <TableHeader sticky>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Profile</TableHead>
                    <TableHead scope="col">Type</TableHead>
                    <TableHead scope="col" numeric>IB equiv</TableHead>
                    <TableHead scope="col">Score / Band</TableHead>
                    <TableHead scope="col">Actual school</TableHead>
                    <TableHead scope="col">Country</TableHead>
                    <TableHead scope="col">Result</TableHead>
                    <TableHead scope="col" numeric>Chance</TableHead>
                    <TableHead scope="col" className="text-center">Pass</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batch.rows.map(row => (
                    <TableRow key={row.id} className={row.validation_pass ? '' : 'bg-danger/5'}>
                      <TableCell className="font-medium text-foreground">{row.profile_name}</TableCell>
                      <TableCell className="text-muted-foreground">{row.programme_type}</TableCell>
                      <TableCell numeric className="text-foreground">{row.student_ib_equivalent ?? '—'}</TableCell>
                      <TableCell>
                        <span className="text-foreground">{row.student_score ?? '—'}</span>
                        {row.student_band && (
                          <span className={`ml-2 text-xs ${bandColor(row.student_band)}`}>
                            {row.student_band}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-foreground" title={row.actual_university}>
                        {row.actual_university}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.actual_country}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-medium ${tierColor(row.algorithm_result)}`}>
                          {row.algorithm_result ?? 'Not found'}
                        </span>
                      </TableCell>
                      <TableCell numeric className="text-foreground">
                        {row.chance_percent != null ? `${row.chance_percent}%` : '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.validation_pass ? (
                          <span className="font-bold text-success" title="Pass">✓</span>
                        ) : (
                          <span className="font-bold text-danger" title="Fail">✗</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
