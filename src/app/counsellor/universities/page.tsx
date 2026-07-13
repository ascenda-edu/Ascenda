import { PageHero } from '@/components/layout/page-hero';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadRoster } from '@/lib/counsellor/data';
import { loadDecks } from '@/lib/counsellor/decks';
import { UniversitiesClient } from './_universities-client';

export const dynamic = 'force-dynamic';

export default async function CounsellorUniversitiesPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const [decks, roster] = await Promise.all([
    // Deck tables may not exist until the migration is applied — the search
    // half of the page still works, so degrade to an empty library.
    user ? loadDecks(supabase, user.id).catch(() => []) : Promise.resolve([]),
    // Slim loader — the chips only need name/flag/completion, not the full cohort.
    loadRoster(supabase, { excludeId: user?.id }),
  ]);

  const totalCards = decks.reduce((acc, d) => acc + d.cards.length, 0);
  const studentsWithDecks = new Set(decks.flatMap((d) => d.assignees.map((a) => a.profileId))).size;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Counsellor"
        accent="Quest board"
        highlight={`${decks.length} deck${decks.length === 1 ? '' : 's'}`}
        title="University decks"
        description="Search the catalogue, collect programmes into themed decks, and assign them to students as quests."
        stats={[
          { label: 'Decks', value: String(decks.length), detail: 'In your library' },
          { label: 'Cards', value: String(totalCards), detail: 'Programmes collected' },
          { label: 'On quests', value: String(studentsWithDecks), detail: 'Students with a deck' },
          { label: 'Cohort', value: String(roster.length), detail: 'Students you manage' },
        ]}
      />
      <UniversitiesClient initialDecks={decks} roster={roster} />
    </div>
  );
}
