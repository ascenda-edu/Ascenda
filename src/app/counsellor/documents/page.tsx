import { PageHero } from '@/components/layout/page-hero';
import { CounsellorDocumentBoard } from '../_components/counsellor-document-board';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadCounsellorDocuments } from '@/lib/counsellor/data';

export const dynamic = 'force-dynamic';

export default async function CounsellorDocumentsPage() {
  const supabase = createServerSupabaseClient();
  const docs = await loadCounsellorDocuments(supabase);
  const received = docs.filter((d) => d.status === 'received').length;
  const pending = docs.filter((d) => d.status === 'pending').length;
  const overdue = docs.filter((d) => d.status === 'overdue').length;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Counsellor"
        accent="Documents"
        highlight={overdue > 0 ? `${overdue} overdue` : 'All on track'}
        title="Document management"
        description="Transcripts, recommendation letters, essays, and certificates across the cohort."
        stats={[
          { label: 'Total', value: String(docs.length), detail: 'Documents tracked' },
          { label: 'Received', value: String(received), detail: 'Complete' },
          { label: 'Pending', value: String(pending), detail: 'Awaiting' },
          { label: 'Overdue', value: String(overdue), detail: 'Need attention' }
        ]}
      />

      <CounsellorDocumentBoard documents={docs} />
    </div>
  );
}
