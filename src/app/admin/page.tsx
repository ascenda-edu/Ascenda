import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/identity';
import { PageHero } from '@/components/layout/page-hero';
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

  // Was `const { data: profile } = …` with the error discarded. That failed
  // closed only by accident — `undefined?.role !== 'admin'` — so an unreadable
  // profiles row (RLS change, outage) locked every admin out with nothing logged
  // and nothing distinguishing it from a legitimate denial. requireRole binds the
  // error, resolves identity ONCE per request via React cache(), and is the same
  // rule the API routes' requireAdminUser applies.
  await requireRole('admin');

  const { data: sourcesData } = await supabase.from('sources').select('*').order('last_scraped_at', { ascending: false });
  const sources = (sourcesData ?? []) as SourceRow[];
  const neverScraped = sources.filter((source) => !source.last_scraped_at).length;

  // The shell and the section nav live in layout.tsx so they survive navigation
  // between the two admin routes.
  return (
    <>
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
    </>
  );
}
