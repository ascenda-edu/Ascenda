import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { PageHero } from '@/components/layout/page-hero';
import { RecLetterWorkflow } from '@/components/applications/rec-letter-workflow';
import {
  DocumentsManager,
  type DocumentManagerApp,
  type ManagedDocument
} from '@/components/applications/documents-manager';
import { DEMO_REC_LETTERS } from '@/lib/data/student-demo-data';
import { AnimatedSection } from '@/components/layout/animated-section';
import { loadApplicationLabels, loadDocumentsForApplications } from '@/lib/data/applications';
import type { ApplicationLabelRow } from '@/lib/data/columns';
import { logger } from '@/lib/observability/logger';

export const metadata: Metadata = {
  title: 'Documents'
};

export default async function DocumentsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // ── Real applications + documents ──────────────────────────────────────
  // Both loaders unwrap: failures surface in the error boundary, because an
  // empty documents page for a user who has uploads reads as data loss.
  const apps = await loadApplicationLabels(supabase, user.id);
  const appLabel = (app: ApplicationLabelRow) => {
    const uni = app.program?.universities?.name ?? 'University';
    const programme = app.program?.name ?? 'Programme';
    return `${uni} · ${programme}`;
  };
  const labelById = new Map(apps.map((app) => [app.id, appLabel(app)]));
  const managerApps: DocumentManagerApp[] = apps.map((app) => ({ id: app.id, label: appLabel(app) }));

  let documents: ManagedDocument[] = [];
  const appIds = apps.map((app) => app.id);
  if (appIds.length > 0) {
    const rows = await loadDocumentsForApplications(supabase, appIds);
    const bucket = process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'application-documents';
    const signedByPath = new Map<string, string>();
    if (rows.length > 0) {
      const { data: signed, error: signError } = await supabase.storage
        .from(bucket)
        .createSignedUrls(rows.map((row) => row.storage_path), 60 * 60);
      if (signError) {
        // Documents still render without View links; log so a broken bucket
        // config doesn't silently strip every link. Same disposition as
        // `soft()` — a named fallback (no signed URL) plus a log — but this is
        // Storage, not PostgREST, so it does not go through that helper.
        logger.error('documents: signing URLs failed', signError, { documentCount: rows.length });
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
    <>
      <PageHero
        tone="student"
        eyebrow="Documents"
        title="Letters, transcripts, the rest"
        description="Keep your recommendation letters, transcripts, and other application docs in one tidy place."
        stats={[
          // Letters intentionally absent: the tracker below is sample data, so a
          // hero "Letters 2/4" stat would misread as the user's real progress.
          { label: 'Documents', value: `${documents.length}`, detail: 'Uploaded' },
          { label: 'Applications', value: `${managerApps.length}`, detail: 'Tracked' }
        ]}
      />

      <AnimatedSection>
        <div className="surface-card">
          <div className="relative z-10">
            <p className="eyebrow">Recommendation letters</p>
            <h2 className="mb-1 text-foreground">Letter tracker</h2>
            <p className="text-xs text-muted-foreground mb-6">
              Track the status of each recommendation letter from request to upload. Sample data — shown as a preview of the workflow.
            </p>
            <RecLetterWorkflow letters={DEMO_REC_LETTERS} />
          </div>
        </div>
      </AnimatedSection>

      <AnimatedSection delay={0.1}>
        <div className="surface-card">
          <div className="relative z-10">
            <p className="eyebrow">Uploaded documents</p>
            <h2 className="mb-1 text-foreground">Your files</h2>
            <p className="text-xs text-muted-foreground mb-6">
              Transcripts, certificates, and other supporting documents — stored securely against each application.
            </p>
            <DocumentsManager applications={managerApps} documents={documents} />
          </div>
        </div>
      </AnimatedSection>
    </>
  );
}
