import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/shell';

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
  if (result === 'Safety') return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400';
  if (result === 'Target') return 'bg-sky-500/10 text-sky-700 dark:text-sky-300';
  if (result === 'Reach') return 'bg-amber-500/10 text-amber-700 dark:text-amber-400';
  if (result.startsWith('Best:')) return 'bg-violet-500/10 text-violet-700 dark:text-violet-300';
  return 'bg-rose-500/10 text-rose-600 dark:text-rose-400';
}

function bandColor(band: string | null) {
  if (!band) return 'text-muted-foreground';
  if (band === 'Exceptional') return 'text-violet-600 dark:text-violet-400 font-semibold';
  if (band === 'Very strong') return 'text-sky-600 dark:text-sky-400 font-semibold';
  if (band === 'Strong') return 'text-emerald-600 dark:text-emerald-400';
  if (band === 'Solid') return 'text-amber-600 dark:text-amber-400';
  if (band === 'Borderline') return 'text-orange-600 dark:text-orange-400';
  return 'text-rose-600 dark:text-rose-400';
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
      <div className="py-8 space-y-10">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Algorithm Simulation</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Validates scoring + matching against real-world admission outcomes. A PASS means the algorithm
            classified the student&apos;s actual school as Safety, Target, or Reach.
          </p>
        </div>

        {batches.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-muted-foreground">No simulation results yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Run: <code className="bg-muted px-1 rounded">npx tsx scripts/simulate-profiles.ts batch_10</code>
            </p>
          </div>
        )}

        {batches.map(batch => (
          <div key={batch.run_id} className="space-y-4">
            {/* Batch header */}
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold text-foreground capitalize">
                {batch.batch_label.replace('_', ' ')}
              </h2>
              <span className="text-sm text-muted-foreground">
                {new Date(batch.created_at).toLocaleString()} · run {batch.run_id.slice(0, 8)}
              </span>
              <div className={`ml-auto flex items-center gap-2 px-3 py-1 rounded-full text-sm font-semibold tabular-nums
                ${batch.passRate >= 80 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' :
                  batch.passRate >= 60 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'}`}>
                {batch.passed}/{batch.total} pass · {batch.passRate}%
              </div>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Total profiles', value: batch.total },
                { label: 'Pass rate', value: `${batch.passRate}%` },
                { label: 'Safety / Target', value: batch.rows.filter(r => r.algorithm_result === 'Safety' || r.algorithm_result === 'Target').length },
                { label: 'Reach', value: batch.rows.filter(r => r.algorithm_result === 'Reach').length },
              ].map(stat => (
                <div key={stat.label} className="rounded-lg border border-border bg-card px-4 py-3">
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                  <div className="text-xl font-bold text-foreground tabular-nums mt-0.5">{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Findings */}
            {batch.rows.filter(r => !r.validation_pass).length > 0 && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-4 py-3">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-1">
                  ⚠ Failures ({batch.rows.filter(r => !r.validation_pass).length}) — Algorithm calibration findings:
                </p>
                {batch.rows.filter(r => !r.validation_pass).map(r => (
                  <p key={r.id} className="text-xs text-amber-700 dark:text-amber-400">
                    • <strong>{r.profile_name}</strong> (IB equiv {r.student_ib_equivalent}) →{' '}
                    {r.actual_university}: result was <em>{r.algorithm_result ?? 'Not found'}</em>
                  </p>
                ))}
              </div>
            )}

            {/* Results table */}
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b border-border">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Profile</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Type</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">IB equiv</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Score / Band</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Actual school</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Country</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Result</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Chance</th>
                    <th scope="col" className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase">Pass</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 bg-card">
                  {batch.rows.map(row => (
                    <tr key={row.id} className={row.validation_pass ? '' : 'bg-rose-500/5'}>
                      <td className="px-4 py-3 font-medium text-foreground">{row.profile_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.programme_type}</td>
                      <td className="px-4 py-3 text-foreground tabular-nums">{row.student_ib_equivalent ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="text-foreground tabular-nums">{row.student_score ?? '—'}</span>
                        {row.student_band && (
                          <span className={`ml-2 text-xs ${bandColor(row.student_band)}`}>
                            {row.student_band}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-foreground max-w-[200px] truncate" title={row.actual_university}>
                        {row.actual_university}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.actual_country}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${tierColor(row.algorithm_result)}`}>
                          {row.algorithm_result ?? 'Not found'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-foreground tabular-nums">
                        {row.chance_percent != null ? `${row.chance_percent}%` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.validation_pass ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">✓</span>
                        ) : (
                          <span className="text-rose-500 font-bold">✗</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    </DashboardShell>
  );
}
