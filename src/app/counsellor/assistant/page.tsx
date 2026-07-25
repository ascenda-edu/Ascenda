import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { AssistantWorkspace } from '@/components/assistant/assistant-workspace';

export const metadata: Metadata = { title: 'Assistant · Counsellor' };
export const dynamic = 'force-dynamic';

export default async function CounsellorAssistantPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="space-y-6">
      <AssistantWorkspace mode="counsellor" userId={user.id} />
    </div>
  );
}
