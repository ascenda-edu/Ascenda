import Link from 'next/link';
import { Scroll, CheckCircle2, Sparkles, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { loadStudentQuestDecks } from '@/lib/counsellor/decks';
import { DECK_FIT, DECK_RARITY } from '@/lib/counsellor/deck-theme';
import { HubCard } from '@/components/dashboard/hub/hub-card';

/**
 * "Quests from your counsellor" hub cell, streamed behind Suspense: decks of
 * universities a counsellor assigned to this student. Renders nothing when the
 * student has no assignments (or the deck tables don't exist yet), so the
 * dashboard is unchanged for unassigned students.
 */

export async function CounsellorQuests({ profileId }: { profileId: string }) {
  const supabase = await createServerSupabaseClient();
  const questDecks = await loadStudentQuestDecks(supabase, profileId).catch(() => []);
  if (questDecks.length === 0) return null;

  const questCount = questDecks.reduce((acc, d) => acc + d.quests.length, 0);
  const clearedCount = questDecks.reduce((acc, d) => acc + d.quests.filter((q) => q.cleared).length, 0);

  return (
    <div id="counsellor-quests">
      <HubCard
        eyebrow="From your counsellor"
        title={`Quest log · ${clearedCount}/${questCount} cleared`}
        icon={Scroll}
        iconClassName="text-muted-foreground"
        action={{ label: 'Open quest log', href: '/university-search/quests' }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {questDecks.map((deck) => (
            <div key={deck.deckId} className="rounded-2xl border border-border/60 bg-background/40 p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-lg" aria-hidden>{deck.theme.emoji ?? '🗡️'}</span>
                <p className="text-sm font-semibold text-foreground">{deck.deckName}</p>
              </div>
              {deck.message && (
                <p className="mb-2 text-xs italic text-muted-foreground">“{deck.message}”</p>
              )}
              <ul className="space-y-1.5">
                {deck.quests.map((quest) => {
                  const rarity = DECK_RARITY[quest.rarity];
                  const fit = DECK_FIT[quest.fit];
                  return (
                    <li key={quest.programId} className="flex items-center gap-2 text-sm">
                      {quest.cleared ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-label="Cleared — application started" />
                      ) : (
                        <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Active quest" />
                      )}
                      <Link
                        href={`/course/${quest.programId}?from=dashboard`}
                        className={cn(
                          'min-w-0 flex-1 truncate underline-offset-2 hover:underline',
                          quest.cleared ? 'text-muted-foreground line-through' : 'text-foreground'
                        )}
                        title={`${quest.university} — ${quest.courseName}`}
                      >
                        {quest.university} — {quest.courseName}
                      </Link>
                      <span className={cn('flex shrink-0 items-center gap-0.5', rarity.color)} aria-label={`Rarity: ${quest.rarity}`}>
                        {Array.from({ length: rarity.stars }).map((_, i) => (
                          <Star key={i} className="h-2.5 w-2.5 fill-current" />
                        ))}
                      </span>
                      <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-label font-semibold', fit.badge)}>
                        {fit.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </HubCard>
    </div>
  );
}
