// RPG "character sheet" for the counsellor's student detail page — server-safe
// (no interactivity). Level/XP derive from real profile signals; the quest log
// lists the university decks assigned to the student, with a quest marked
// cleared once the student has started an application for that programme.

import { Star, Swords, Scroll, CheckCircle2, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CounsellorStudent } from '@/lib/counsellor/types';
import type { StudentQuestDeck } from '@/lib/counsellor/decks';
import { DECK_FIT, DECK_RARITY } from '@/lib/counsellor/deck-theme';

const XP_PER_LEVEL = 300;

const LEVEL_TITLES: Array<{ min: number; title: string }> = [
  { min: 9, title: 'Legend' },
  { min: 7, title: 'Sage' },
  { min: 5, title: 'Scholar' },
  { min: 3, title: 'Apprentice' },
  { min: 1, title: 'Novice' },
];

function deriveProgress(student: CounsellorStudent) {
  const testsWithScore = student.academic.admissionsTests.filter((t) => t.score).length;
  const xp =
    student.profile.completionPct * 10 +
    student.matches.length * 20 +
    student.applications.length * 60 +
    testsWithScore * 40;
  const level = Math.max(1, Math.floor(xp / XP_PER_LEVEL) + 1);
  const intoLevel = xp % XP_PER_LEVEL;
  const title = LEVEL_TITLES.find((t) => level >= t.min)?.title ?? 'Novice';
  const cluster = student.academic.clusters[0]?.replace(/_/g, ' ');
  return {
    level,
    xpPct: Math.round((intoLevel / XP_PER_LEVEL) * 100),
    classTitle: cluster ? `${cluster} ${title}` : title,
  };
}

function statBlocks(student: CounsellorStudent) {
  const bestTest = student.academic.admissionsTests.find((t) => t.score);
  const grades =
    student.academic.programmeType === 'IB'
      ? student.academic.ibPoints
        ? `IB ${student.academic.ibPoints}`
        : 'IB —'
      : student.academic.aLevelGrades?.replace(' (predicted)', '') ?? 'A-Level —';
  return [
    { stat: 'STR', label: 'Academics', value: grades },
    { stat: 'INT', label: 'Tests', value: bestTest ? `${bestTest.type} ${bestTest.score}` : '—' },
    { stat: 'CHA', label: 'Applications', value: String(student.applications.length) },
    { stat: 'VIT', label: 'Profile', value: `${student.profile.completionPct}%` },
  ];
}

interface Props {
  student: CounsellorStudent;
  questDecks: StudentQuestDeck[];
}

export function CharacterSheet({ student, questDecks }: Props) {
  const { level, xpPct, classTitle } = deriveProgress(student);
  const stats = statBlocks(student);
  const questCount = questDecks.reduce((acc, d) => acc + d.quests.length, 0);
  const clearedCount = questDecks.reduce((acc, d) => acc + d.quests.filter((q) => q.cleared).length, 0);

  return (
    <section className="surface-card surface-card--static space-y-5" aria-label="Character sheet">
      {/* Header: level + class + XP */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-500/20">
            <Swords className="h-5 w-5 text-violet-600 dark:text-violet-300" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Character sheet</p>
            <h2 className="font-heading text-lg font-bold capitalize text-foreground">
              Lv {level} {classTitle}
            </h2>
          </div>
        </div>
        <div className="flex-1 space-y-1.5 sm:pl-4">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">XP to next level</span>
            <span className="font-semibold tabular-nums text-violet-600 dark:text-violet-300">{xpPct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted/60" role="progressbar" aria-valuenow={xpPct} aria-valuemin={0} aria-valuemax={100} aria-label="Experience toward next level">
            <div
              className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all"
              style={{ width: `${xpPct}%` }}
            />
          </div>
          <p className="text-[0.6875rem] text-muted-foreground">
            XP grows with profile completion, matches, tests, and applications.
          </p>
        </div>
      </div>

      {/* Stat blocks */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map(({ stat, label, value }) => (
          <div key={stat} className="rounded-2xl border border-border/60 bg-background/60 px-4 py-3 text-center">
            <p className="text-[0.625rem] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-300">{stat}</p>
            <p className="truncate text-sm font-bold tabular-nums text-foreground" title={value}>{value}</p>
            <p className="text-[0.6875rem] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Quest log */}
      <div className="space-y-3 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Scroll className="h-3.5 w-3.5" /> Quest log
          </p>
          {questCount > 0 && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {clearedCount}/{questCount} cleared
            </span>
          )}
        </div>

        {questDecks.length === 0 ? (
          <p className="rounded-[24px] border border-dashed border-border bg-muted/40 p-5 text-center text-sm text-muted-foreground">
            No quests yet — assign a university deck from the{' '}
            <a href="/counsellor/universities" className="font-semibold text-violet-600 underline-offset-2 hover:underline dark:text-violet-300">
              quest board
            </a>
            .
          </p>
        ) : (
          <div className="space-y-3">
            {questDecks.map((deck) => (
              <div key={deck.deckId} className="rounded-2xl border border-border/60 bg-background/40 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-lg">{deck.theme.emoji ?? '🗡️'}</span>
                  <p className="text-sm font-semibold text-foreground">{deck.deckName}</p>
                  {deck.message && (
                    <p className="truncate text-xs italic text-muted-foreground" title={deck.message}>
                      “{deck.message}”
                    </p>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {deck.quests.map((quest) => {
                    const rarity = DECK_RARITY[quest.rarity];
                    return (
                      <li key={quest.programId} className="flex items-center gap-2 text-sm">
                        {quest.cleared ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-label="Cleared" />
                        ) : (
                          <Sparkles className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="Active" />
                        )}
                        <span className={cn('min-w-0 flex-1 truncate', quest.cleared ? 'text-muted-foreground line-through' : 'text-foreground')}>
                          {quest.university} — {quest.courseName}
                        </span>
                        <span className={cn('flex shrink-0 items-center gap-0.5', rarity.color)} aria-label={`Rarity: ${quest.rarity}`}>
                          {Array.from({ length: rarity.stars }).map((_, i) => (
                            <Star key={i} className="h-2.5 w-2.5 fill-current" />
                          ))}
                        </span>
                        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold', DECK_FIT[quest.fit].badge)}>
                          {DECK_FIT[quest.fit].label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
