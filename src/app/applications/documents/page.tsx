import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { SectionNav } from '@/components/layout/section-nav';
import { PLANNER_SECTION_ITEMS } from '@/components/layout/navigation';
import { RecLetterWorkflow } from '@/components/applications/rec-letter-workflow';
import {
  DocumentsManager,
  type DocumentManagerApp,
  type ManagedDocument
} from '@/components/applications/documents-manager';
import { DEMO_REC_LETTERS } from '@/lib/data/student-demo-data';
import { AnimatedSection } from '@/components/layout/animated-section';

export const metadata: Metadata = {
  title: 'Documents'
};

type ApplicationJoin = {
  id: string;
  program: {
    name: string | null;
    universities: { name: string | null } | null;
  } | null;
};

type DocumentJoin = {
  id: string;
  name: string;
  type: string | null;
  storage_path: string;
  uploaded_at: string | null;
  application_id: string;
};

export default async function DocumentsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // ── Real applications + documents ──────────────────────────────────────
  const { data: applicationRows, error: applicationsError } = await supabase
    .from('applications')
    .select('id, program:programs(name:course_name, universities(name))')
    .eq('profile_id', user.id);

  // Surface failures in the error boundary — an empty documents page for a
  // user who has uploads reads as data loss.
  if (applicationsError) {
    throw new Error(`documents: applications query failed — ${applicationsError.message}`);
  }

  const apps = ((applicationRows ?? []) as unknown as ApplicationJoin[]) ?? [];
  const appLabel = (app: ApplicationJoin) => {
    const uni = app.program?.universities?.name ?? 'University';
    const programme = app.program?.name ?? 'Programme';
    return `${uni} · ${programme}`;
  };
  const labelById = new Map(apps.map((app) => [app.id, appLabel(app)]));
  const managerApps: DocumentManagerApp[] = apps.map((app) => ({ id: app.id, label: appLabel(app) }));

  let documents: ManagedDocument[] = [];
  const appIds = apps.map((app) => app.id);
  if (appIds.length > 0) {
    const { data: docRows, error: documentsError } = await supabase
      .from('documents')
      .select('id, name, type, storage_path, uploaded_at, application_id')
      .in('application_id', appIds)
      .order('uploaded_at', { ascending: false });
    if (documentsError) {
      throw new Error(`documents: documents query failed — ${documentsError.message}`);
    }

    const rows = ((docRows ?? []) as DocumentJoin[]) ?? [];
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'application-documents';
    const signedByPath = new Map<string, string>();
    if (rows.length > 0) {
      const { data: signed, error: signError } = await supabase.storage
        .from(bucket)
        .createSignedUrls(rows.map((row) => row.storage_path), 60 * 60);
      if (signError) {
        // Documents still render without View links; log so a broken bucket
        // config doesn't silently strip every link.
        console.error('documents: signing URLs failed', signError);
      }
      for (const item of signed ?? []) {
        if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
      }
    }

    documents = rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      uploadedAt: row.uploaded_at,
      application: labelById.get(row.application_id) ?? 'Application',
      url: signedByPath.get(row.storage_path) ?? null
    }));
  }

  return (
    <DashboardShell>
      <SectionNav items={PLANNER_SECTION_ITEMS} />
      <PageHero
        tone="student"
        eyebrow="Documents"
        title="Letters, transcripts, the rest"
        description="Keep your recommendation letters, transcripts, and other application docs in one tidy place."
        accent="Files"
        stats={[
          // Letters intentionally absent: the tracker below is sample data, so a
          // hero "Letters 2/4" stat would misread as the user's real progress.
          { label: 'Documents', value: `${documents.length}`, detail: 'Uploaded' },
          { label: 'Applications', value: `${managerApps.length}`, detail: 'Tracked' }
        ]}
      />

      <AnimatedSection className="mt-8">
        <div className="surface-card surface-card--static">
          <div className="relative z-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Recommendation letters</p>
            <p className="text-lg font-semibold text-foreground mb-1">Letter tracker</p>
            <p className="text-xs text-muted-foreground mb-6">
              Track the status of each recommendation letter from request to upload. Sample data — shown as a preview of the workflow.
            </p>
            <RecLetterWorkflow letters={DEMO_REC_LETTERS} />
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection className="mt-8" delay={0.1}>
        <div className="surface-card surface-card--static">
          <div className="relative z-10">
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Uploaded documents</p>
            <p className="text-lg font-semibold text-foreground mb-1">Your files</p>
            <p className="text-xs text-muted-foreground mb-6">
              Transcripts, certificates, and other supporting documents — stored securely against each application.
            </p>
            <DocumentsManager applications={managerApps} documents={documents} />
          </div>
        </div>
      </AnimatedSection>
    </DashboardShell>
  );
}
