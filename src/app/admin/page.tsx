import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { SectionNav } from '@/components/layout/section-nav';
import { ADMIN_SECTION_ITEMS } from '@/components/layout/navigation';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
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
  const supabase = await createServerSupabaseClient();
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
  const neverScraped = sources.filter((source) => !source.last_scraped_at).length;

  return (
    <DashboardShell>
      <SectionNav items={ADMIN_SECTION_ITEMS} />
      <PageHero
        tone="counsellor"
        eyebrow="Admin"
        title="Admin console"
        description="Manage catalog data, data freshness, and system health."
        breadcrumbs={<Breadcrumbs />}
        stats={[
          { label: 'Data sources', value: String(sources.length) },
          { label: 'Never scraped', value: String(neverScraped) }
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <ImportPanel />
        <aside className="surface-card space-y-4">
          <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">Data sources</h2>
          <ul className="space-y-3 text-sm text-muted-foreground">
            {sources.map((source) => (
              <li key={source.id}>
                <p className="font-semibold text-foreground">{source.name}</p>
                <p>{source.url ?? 'No URL provided'}</p>
                <p className="eyebrow">Last scraped: {source.last_scraped_at ? dateTimeFormatter.format(new Date(source.last_scraped_at)) : 'Never'}</p>
              </li>
            ))}
            {sources.length === 0 ? <li>No sources yet.</li> : null}
          </ul>
        </aside>
      </div>
    </DashboardShell>
  );
}
