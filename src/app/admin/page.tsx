import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/shell';
import { ImportPanel } from './_components/import-panel';

type SourceRow = {
  id: string;
  name?: string | null;
  url?: string | null;
  last_scraped_at?: string | null;
};

export const metadata: Metadata = {
  title: 'Admin console'
};

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export default async function AdminPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  if (profile?.role !== 'admin') {
    redirect('/dashboard');
  }

  const { data: sourcesData } = await supabase.from('sources').select('*').order('last_scraped_at', { ascending: false });
  const sources = (sourcesData ?? []) as SourceRow[];

  return (
    <DashboardShell>
      <section className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Admin console</h1>
        <p className="text-sm text-muted-foreground">Manage catalog data, data freshness, and system health.</p>
      </section>
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <ImportPanel />
        <aside className="surface-card surface-card--static space-y-4">
          <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">Data sources</h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            {sources.map((source) => (
              <li key={source.id}>
                <p className="font-semibold text-foreground">{source.name}</p>
                <p>{source.url ?? 'No URL provided'}</p>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Last scraped: {source.last_scraped_at ? dateTimeFormatter.format(new Date(source.last_scraped_at)) : 'Never'}</p>
              </li>
            ))}
            {sources.length === 0 ? <li>No sources yet.</li> : null}
          </ul>
        </aside>
      </div>
    </DashboardShell>
  );
}
