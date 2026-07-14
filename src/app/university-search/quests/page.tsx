import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadStudentQuestDecks } from '@/lib/counsellor/decks';
import { QuestsClient } from './_quests-client';

// Student "Quests" tab in the Explore section: the decks a counsellor curated
// and assigned to this student, rendered as a game-framed quest log. Distinct
// from Shortlist (the student's own saved programmes) and Search (the
// catalogue) — this is counsellor-curated, read-only-with-actions.
export default async function QuestsPage() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  // Deck tables may not exist on every environment (same feature-detect posture
  // as the dashboard quest widget) — fall back to an empty quest log.
  const questDecks = await loadStudentQuestDecks(supabase, user.id).catch(() => []);

  return <QuestsClient decks={questDecks} />;
}
