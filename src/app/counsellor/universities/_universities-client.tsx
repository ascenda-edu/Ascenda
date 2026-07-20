'use client';

// Counsellor deck builder: catalogue search on the left, deck library +
// selected-deck detail on the right. Decks are video-game framed (cards with
// a rarity + fit), and assigning a deck sends the student a "quest"
// notification via the trg_deck_assignment_notify DB trigger.

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Layers,
  Loader2,
  Plus,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';
import { getBrowserSupabaseClient } from '@/lib/supabase/client';
import { filterVisiblePrograms } from '@/lib/catalog/visibility';
import type { CounsellorDeck, DeckCard } from '@/lib/counsellor/decks';
import { DECK_FIT, DECK_RARITY } from '@/lib/counsellor/deck-theme';
import type { DeckCardFit, DeckCardRarity } from '@/lib/types/demo-tables';

interface RosterStudent {
  id: string;
  name: string;
  flag: string;
  completionPct: number;
}

interface SearchResult {
  programId: string;
  courseName: string;
  university: string;
  country: string;
  city: string | null;
}

interface Props {
  initialDecks: CounsellorDeck[];
  roster: RosterStudent[];
}

const RARITY_ORDER: DeckCardRarity[] = ['common', 'rare', 'epic', 'legendary'];
const FIT_ORDER: DeckCardFit[] = ['reach', 'match', 'safety'];

const RESULT_LIMIT = 30;

const DECK_EMOJI = ['🗡️', '🛡️', '🐉', '🏰', '✨', '🔮', '🏹', '⚔️'];

const sanitize = (value: string) => value.replace(/[(),%_]/g, ' ').replace(/\s+/g, ' ').trim();
const UNI_STOP_WORDS = new Set(['university', 'college', 'institute', 'school', 'of', 'the', 'and']);

// Mirrors the focusable-element query used by the shared Dialog primitive and
// analytics-drilldown so hand-rolled overlays trap focus, close on Escape, and
// restore focus to the trigger — the same three behaviours.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useModalA11y(open: boolean, onClose: () => void) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      const node = modalRef.current;
      const target = node?.querySelector<HTMLElement>(FOCUSABLE) ?? node;
      target?.focus();
    } else {
      previouslyFocused.current?.focus?.();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const node = modalRef.current;
    if (!node) return;
    const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null
    );
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { modalRef, onKeyDown };
}

export function UniversitiesClient({ initialDecks, roster }: Props) {
  const { showToast } = useToast();

  // ── deck state ──────────────────────────────────────────────────────────────
  const [decks, setDecks] = useState<CounsellorDeck[]>(initialDecks);
  const [selectedDeckId, setSelectedDeckId] = useState<string | null>(initialDecks[0]?.id ?? null);
  const selectedDeck = decks.find((d) => d.id === selectedDeckId) ?? null;
  const [deckPendingDelete, setDeckPendingDelete] = useState<CounsellorDeck | null>(null);
  const [isDeletingDeck, setIsDeletingDeck] = useState(false);

  // ── search state ────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    fetch('/api/search/filter-options')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setCountries(data?.countries ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = sanitize(debouncedQuery);
    if (!q && !country) {
      setResults([]);
      setHasSearched(false);
      setSearchFailed(false);
      return;
    }
    const controller = new AbortController();
    const run = async () => {
      setIsSearching(true);
      setSearchFailed(false);
      try {
        const supabase = getBrowserSupabaseClient();
        // Base programs query. The country filter rides along as an inner-join
        // embed (`universities!inner` + eq on the embedded column) so we never
        // have to fetch a country's full university-id list and stuff it into
        // a giant .in() querystring.
        const buildBase = () =>
          country
            ? supabase
                .from('programs')
                .select('id, course_name, universities!inner(id, name, country, city)')
                .eq('universities.country', country)
                .limit(RESULT_LIMIT)
            : supabase
                .from('programs')
                .select('id, course_name, universities!left(id, name, country, city)')
                .limit(RESULT_LIMIT);

        type ProgramRow = { id: string; course_name: string | null; universities: any };
        let rows: ProgramRow[] = [];

        if (q) {
          const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2);
          // Match the words against university names (well-known unis ranked
          // first via recognition_score) AND against course_name, then merge:
          // results include programmes at name-matched unis plus programmes
          // whose course name matches. Two separate queries with chained
          // .ilike()/.in() avoid the PostgREST .or()-with-spaces parse crash.
          let uniQuery = supabase
            .from('universities')
            .select('id')
            .order('recognition_score', { ascending: false, nullsFirst: false })
            .limit(100);
          words.forEach((w) => {
            uniQuery = uniQuery.ilike('name', `%${w}%`);
          });

          const courseWords = words.filter((w) => !UNI_STOP_WORDS.has(w));
          let courseRequest = buildBase();
          (courseWords.length > 0 ? courseWords : words).forEach((w) => {
            courseRequest = courseRequest.ilike('course_name', `%${w}%`);
          });

          const [uniRes, courseRes] = await Promise.all([
            uniQuery.abortSignal(controller.signal),
            courseRequest.abortSignal(controller.signal),
          ]);
          if (uniRes.error) throw uniRes.error;
          if (courseRes.error) throw courseRes.error;

          const matchedIds = (uniRes.data ?? []).map((r) => r.id);
          let uniProgramRows: ProgramRow[] = [];
          if (matchedIds.length > 0) {
            const uniProgramsRes = await buildBase()
              .in('university_id', matchedIds)
              .abortSignal(controller.signal);
            if (uniProgramsRes.error) throw uniProgramsRes.error;
            uniProgramRows = (uniProgramsRes.data ?? []) as any[];
          }

          // University-name matches first (they're recognition-ranked), then
          // course-name matches; dedupe by programme id.
          const seen = new Set<string>();
          for (const row of [...uniProgramRows, ...((courseRes.data ?? []) as any[])]) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            rows.push(row);
          }
        } else {
          const { data, error } = await buildBase().abortSignal(controller.signal);
          if (error) throw error;
          rows = (data ?? []) as any[];
        }

        const visible = filterVisiblePrograms(
          rows.map((row) => {
            const uni = Array.isArray(row.universities) ? row.universities[0] : row.universities;
            return {
              id: row.id as string,
              course_name: row.course_name as string | null,
              universities: uni,
            };
          })
        );
        setResults(
          visible.slice(0, RESULT_LIMIT).map((row: any) => ({
            programId: row.id,
            courseName: row.course_name ?? 'Programme',
            university: row.universities?.name ?? 'University',
            country: row.universities?.country ?? '',
            city: row.universities?.city ?? null,
          }))
        );
        setHasSearched(true);
      } catch (err) {
        if (!controller.signal.aborted) {
          console.warn('[counsellor/universities] catalogue search failed', err);
          setResults([]);
          setHasSearched(true);
          setSearchFailed(true);
        }
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [debouncedQuery, country]);

  // ── deck mutations ──────────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(initialDecks.length === 0);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckEmoji, setNewDeckEmoji] = useState(DECK_EMOJI[0]);
  const [isCreating, setIsCreating] = useState(false);

  const createDeck = async () => {
    const name = newDeckName.trim();
    if (!name || isCreating) return;
    setIsCreating(true);
    try {
      const res = await fetch('/api/counsellor/decks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, theme: { emoji: newDeckEmoji } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to create deck');
      const deck: CounsellorDeck = {
        id: data.deck.id,
        counsellorId: '',
        name: data.deck.name,
        description: data.deck.description,
        theme: data.deck.theme ?? {},
        createdAt: data.deck.created_at,
        cards: [],
        assignees: [],
      };
      setDecks((prev) => [deck, ...prev]);
      setSelectedDeckId(deck.id);
      setNewDeckName('');
      setCreateOpen(false);
      showToast({ title: `Deck "${deck.name}" created`, variant: 'success' });
    } catch (err) {
      showToast({ title: 'Could not create deck', description: err instanceof Error ? err.message : undefined, variant: 'error' });
    } finally {
      setIsCreating(false);
    }
  };

  const confirmDeleteDeck = async () => {
    const deck = deckPendingDelete;
    if (!deck || isDeletingDeck) return;
    setIsDeletingDeck(true);
    const res = await fetch(`/api/counsellor/decks?id=${deck.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      showToast({ title: 'Could not delete deck', description: data?.error, variant: 'error' });
      setIsDeletingDeck(false);
      return;
    }
    const next = decks.filter((d) => d.id !== deck.id);
    setDecks(next);
    if (selectedDeckId === deck.id) setSelectedDeckId(next[0]?.id ?? null);
    showToast({ title: `Deck "${deck.name}" deleted`, variant: 'info' });
    setIsDeletingDeck(false);
    setDeckPendingDelete(null);
  };

  const patchCard = useCallback(
    async (deckId: string, card: Pick<DeckCard, 'programId'> & Partial<DeckCard>, result?: SearchResult) => {
      const res = await fetch('/api/counsellor/decks/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId,
          programId: card.programId,
          rarity: card.rarity,
          fit: card.fit,
          note: card.note ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      const saved = data.card;
      setDecks((prev) =>
        prev.map((d) => {
          if (d.id !== deckId) return d;
          const existing = d.cards.find((c) => c.programId === card.programId);
          const merged: DeckCard = {
            id: saved.id,
            programId: saved.program_id,
            rarity: saved.rarity,
            fit: saved.fit,
            note: saved.note,
            courseName: existing?.courseName ?? result?.courseName ?? 'Programme',
            university: existing?.university ?? result?.university ?? 'University',
            country: existing?.country ?? result?.country ?? '',
          };
          return {
            ...d,
            cards: existing
              ? d.cards.map((c) => (c.programId === card.programId ? merged : c))
              : [...d.cards, merged],
          };
        })
      );
      return saved;
    },
    []
  );

  const addToDeck = async (result: SearchResult) => {
    if (!selectedDeck) {
      showToast({ title: 'Create a deck first', description: 'Cards need a deck to live in.', variant: 'info' });
      setCreateOpen(true);
      return;
    }
    if (selectedDeck.cards.some((c) => c.programId === result.programId)) {
      showToast({ title: 'Already in this deck', variant: 'info' });
      return;
    }
    try {
      await patchCard(selectedDeck.id, { programId: result.programId }, result);
      showToast({ title: `Added to "${selectedDeck.name}"`, description: result.university, variant: 'success' });
    } catch (err) {
      showToast({ title: 'Could not add card', description: err instanceof Error ? err.message : undefined, variant: 'error' });
    }
  };

  const cycleRarity = async (deckId: string, card: DeckCard) => {
    const next = RARITY_ORDER[(RARITY_ORDER.indexOf(card.rarity) + 1) % RARITY_ORDER.length];
    try {
      await patchCard(deckId, { ...card, rarity: next });
    } catch {
      showToast({ title: 'Could not update rarity', variant: 'error' });
    }
  };

  const cycleFit = async (deckId: string, card: DeckCard) => {
    const next = FIT_ORDER[(FIT_ORDER.indexOf(card.fit) + 1) % FIT_ORDER.length];
    try {
      await patchCard(deckId, { ...card, fit: next });
    } catch {
      showToast({ title: 'Could not update fit', variant: 'error' });
    }
  };

  const removeCard = async (deckId: string, card: DeckCard) => {
    const res = await fetch(`/api/counsellor/decks/cards?id=${card.id}`, { method: 'DELETE' });
    if (!res.ok) {
      showToast({ title: 'Could not remove card', variant: 'error' });
      return;
    }
    setDecks((prev) =>
      prev.map((d) => (d.id === deckId ? { ...d, cards: d.cards.filter((c) => c.id !== card.id) } : d))
    );
  };

  // ── assignment ──────────────────────────────────────────────────────────────
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSelection, setAssignSelection] = useState<Set<string>>(new Set());
  const [assignMessage, setAssignMessage] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const closeAssign = useCallback(() => setAssignOpen(false), []);
  const closeDelete = useCallback(() => {
    setDeckPendingDelete((prev) => (isDeletingDeck ? prev : null));
  }, [isDeletingDeck]);
  const assign = useModalA11y(assignOpen && !!selectedDeck, closeAssign);
  const remove = useModalA11y(!!deckPendingDelete, closeDelete);

  const assignableRoster = useMemo(() => {
    const assigned = new Set(selectedDeck?.assignees.map((a) => a.profileId) ?? []);
    return roster.filter((s) => !assigned.has(s.id));
  }, [roster, selectedDeck]);

  const toggleAssign = (id: string) => {
    setAssignSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const assignDeck = async () => {
    if (!selectedDeck || assignSelection.size === 0 || isAssigning) return;
    setIsAssigning(true);
    try {
      const res = await fetch('/api/counsellor/decks/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deckId: selectedDeck.id,
          studentIds: [...assignSelection],
          message: assignMessage.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      const byId = new Map(roster.map((s) => [s.id, s]));
      const added = (data.assignments as { id: string; student_profile_id: string; created_at: string }[]).map((a) => ({
        assignmentId: a.id,
        profileId: a.student_profile_id,
        name: byId.get(a.student_profile_id)?.name ?? 'Student',
        flag: byId.get(a.student_profile_id)?.flag ?? '🌍',
        assignedAt: a.created_at,
      }));
      setDecks((prev) =>
        prev.map((d) => (d.id === selectedDeck.id ? { ...d, assignees: [...d.assignees, ...added] } : d))
      );
      setAssignOpen(false);
      setAssignSelection(new Set());
      setAssignMessage('');
      showToast({
        title: `Quest sent to ${added.length} student${added.length === 1 ? '' : 's'}`,
        description: `"${selectedDeck.name}" is now on their dashboard.`,
        variant: 'success',
      });
    } catch (err) {
      showToast({ title: 'Could not assign deck', description: err instanceof Error ? err.message : undefined, variant: 'error' });
    } finally {
      setIsAssigning(false);
    }
  };

  const unassign = async (deckId: string, assignmentId: string) => {
    const res = await fetch(`/api/counsellor/decks/assign?id=${assignmentId}`, { method: 'DELETE' });
    if (!res.ok) {
      showToast({ title: 'Could not unassign', variant: 'error' });
      return;
    }
    setDecks((prev) =>
      prev.map((d) =>
        d.id === deckId ? { ...d, assignees: d.assignees.filter((a) => a.assignmentId !== assignmentId) } : d
      )
    );
  };

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      {/* ── Search panel ── */}
      <section className="surface-card surface-card--static space-y-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/15 dark:text-sky-300">
            <Search className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catalogue</p>
            <h2 className="font-heading text-lg font-bold text-foreground">Find universities</h2>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search universities or programmes"
              placeholder="Search universities or programmes…"
              className="w-full rounded-full border border-border bg-background/60 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            aria-label="Filter by country"
            className="rounded-full border border-border bg-background/60 px-4 py-2.5 text-sm outline-none transition focus:border-primary/50"
          >
            <option value="">All countries</option>
            {countries.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="min-h-[200px] space-y-2">
          {isSearching ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching the catalogue…
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-border bg-muted/40 p-10 text-center">
              <Sparkles className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                {searchFailed
                  ? 'Search hit a snag'
                  : hasSearched
                    ? 'No programmes matched'
                    : 'Search the catalogue to collect cards'}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {searchFailed
                  ? 'The catalogue could not be reached — tweak the query to retry.'
                  : hasSearched
                    ? 'Try a broader query or a different country.'
                    : 'Find a programme, add it to a deck, then assign the deck to students as a quest.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              <AnimatePresence initial={false}>
                {results.map((r) => {
                  const inDeck = selectedDeck?.cards.some((c) => c.programId === r.programId) ?? false;
                  return (
                    <motion.li
                      key={r.programId}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-3 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{r.courseName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.university}
                          {r.city ? ` · ${r.city}` : ''}
                          {r.country ? ` · ${r.country}` : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => addToDeck(r)}
                        disabled={inDeck}
                        className={cn(
                          'flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5',
                          inDeck
                            ? 'cursor-default border-emerald-200/60 bg-emerald-500/10 text-emerald-600'
                            : 'border-border bg-background/60 text-foreground hover:border-primary/50'
                        )}
                      >
                        {inDeck ? 'In deck' : (<><Plus className="h-3.5 w-3.5" /> Add</>)}
                      </button>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </section>

      {/* ── Deck rail ── */}
      <aside className="space-y-4">
        {/* Deck library */}
        <section className="surface-card surface-card--static space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/15 dark:text-violet-300">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Library</p>
                <h2 className="font-heading text-lg font-bold text-foreground">Your decks</h2>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen((v) => !v)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs font-semibold transition hover:-translate-y-0.5 hover:border-primary/50"
            >
              <Plus className="h-3.5 w-3.5" /> New deck
            </button>
          </div>

          <AnimatePresence initial={false}>
            {createOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="space-y-3 rounded-[24px] border border-border/60 bg-muted/30 p-4">
                  <input
                    value={newDeckName}
                    onChange={(e) => setNewDeckName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && createDeck()}
                    placeholder='Deck name — e.g. "UK Reach Raid"'
                    className="w-full rounded-full border border-border bg-background/60 px-4 py-2 text-sm outline-none focus:border-primary/50"
                  />
                  <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Deck emblem">
                    {DECK_EMOJI.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        role="radio"
                        aria-checked={newDeckEmoji === emoji}
                        onClick={() => setNewDeckEmoji(emoji)}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full text-base transition',
                          newDeckEmoji === emoji ? 'bg-primary/15 ring-2 ring-primary/40' : 'hover:bg-muted'
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={createDeck}
                    disabled={!newDeckName.trim() || isCreating}
                    className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    {isCreating ? 'Creating…' : 'Create deck'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {decks.length === 0 && !createOpen ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No decks yet — create your first.</p>
          ) : (
            <div className="space-y-2">
              {decks.map((deck) => (
                <button
                  key={deck.id}
                  type="button"
                  onClick={() => setSelectedDeckId(deck.id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition',
                    deck.id === selectedDeckId
                      ? 'border-primary/50 bg-primary/5 ring-1 ring-primary/20'
                      : 'border-border/60 bg-background/40 hover:border-border'
                  )}
                >
                  <span className="text-xl">{deck.theme.emoji ?? '🗡️'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{deck.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {deck.cards.length} card{deck.cards.length === 1 ? '' : 's'} · {deck.assignees.length} student{deck.assignees.length === 1 ? '' : 's'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Selected deck detail */}
        {selectedDeck && (
          <section className="surface-card surface-card--static space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedDeck.theme.emoji ?? '🗡️'}</span>
                <div>
                  <h3 className="font-heading text-lg font-bold text-foreground">{selectedDeck.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedDeck.cards.length} card{selectedDeck.cards.length === 1 ? '' : 's'} — tap a badge to change rarity or fit
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeckPendingDelete(selectedDeck)}
                aria-label={`Delete deck ${selectedDeck.name}`}
                className="rounded-full p-2 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {selectedDeck.cards.length === 0 ? (
              <p className="rounded-[28px] border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                Empty deck — add programmes from the search results.
              </p>
            ) : (
              <ul className="space-y-2">
                <AnimatePresence initial={false}>
                  {selectedDeck.cards.map((card) => {
                    const rarity = DECK_RARITY[card.rarity];
                    const fit = DECK_FIT[card.fit];
                    return (
                      <motion.li
                        key={card.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                        className="overflow-hidden rounded-2xl border border-border/60 bg-background/40 p-3"
                      >
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-foreground">{card.university}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {card.courseName}
                              {card.country ? ` · ${card.country}` : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeCard(selectedDeck.id, card)}
                            aria-label={`Remove ${card.university} from deck`}
                            className="rounded-full p-1 text-muted-foreground transition hover:bg-rose-500/10 hover:text-rose-600"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => cycleRarity(selectedDeck.id, card)}
                            title="Change rarity"
                            className={cn('flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold transition hover:-translate-y-0.5', rarity.badge)}
                          >
                            {Array.from({ length: rarity.stars }).map((_, i) => (
                              <Star key={i} className="h-2.5 w-2.5 fill-current" />
                            ))}
                            {rarity.label}
                          </button>
                          <button
                            type="button"
                            onClick={() => cycleFit(selectedDeck.id, card)}
                            title="Change fit"
                            className={cn('rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold transition hover:-translate-y-0.5', fit.badge)}
                          >
                            {fit.label}
                          </button>
                        </div>
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}

            {/* Assignees */}
            <div className="space-y-2 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> On this quest
                </p>
                <button
                  type="button"
                  onClick={() => setAssignOpen(true)}
                  disabled={selectedDeck.cards.length === 0}
                  className="flex items-center gap-1.5 rounded-full bg-violet-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:-translate-y-0.5 hover:bg-violet-500 disabled:opacity-50"
                >
                  <Send className="h-3 w-3" /> Assign to students
                </button>
              </div>
              {selectedDeck.assignees.length === 0 ? (
                <p className="text-xs text-muted-foreground">Not assigned yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {selectedDeck.assignees.map((a) => (
                    <span
                      key={a.assignmentId}
                      className="flex items-center gap-1.5 rounded-full border border-violet-200/60 bg-violet-500/10 py-1 pl-2.5 pr-1.5 text-xs font-medium text-violet-700 dark:text-violet-300"
                    >
                      {a.flag} {a.name}
                      <button
                        type="button"
                        onClick={() => unassign(selectedDeck.id, a.assignmentId)}
                        aria-label={`Unassign ${a.name}`}
                        className="rounded-full p-0.5 transition hover:bg-violet-500/20"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}
      </aside>

      {/* ── Assign modal ── */}
      <AnimatePresence>
        {assignOpen && selectedDeck && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => setAssignOpen(false)}
          >
            <motion.div
              ref={assign.modalRef}
              tabIndex={-1}
              onKeyDown={assign.onKeyDown}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              role="dialog"
              aria-modal="true"
              aria-label={`Assign deck ${selectedDeck.name}`}
              className="w-full max-w-md rounded-[28px] border border-border bg-card p-6 shadow-xl outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="font-heading text-lg font-bold text-foreground">
                    {selectedDeck.theme.emoji ?? '🗡️'} Assign “{selectedDeck.name}”
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Students get a quest notification and see the deck on their dashboard.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAssignOpen(false)}
                  aria-label="Close"
                  className="rounded-full p-2 text-muted-foreground transition hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {assignableRoster.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
                  Every student in your cohort already has this deck.
                </p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {assignableRoster.map((s) => (
                    <li key={s.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-muted/60">
                        <input
                          type="checkbox"
                          checked={assignSelection.has(s.id)}
                          onChange={() => toggleAssign(s.id)}
                          className="h-4 w-4 rounded border-border accent-violet-600"
                        />
                        <span className="text-base">{s.flag}</span>
                        <span className="flex-1 text-sm font-medium text-foreground">{s.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{s.completionPct}%</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}

              <textarea
                value={assignMessage}
                onChange={(e) => setAssignMessage(e.target.value)}
                placeholder="Optional message — shows in their quest log"
                rows={2}
                className="mt-3 w-full resize-none rounded-2xl border border-border bg-background/60 px-4 py-2.5 text-sm outline-none focus:border-primary/50"
              />

              <button
                type="button"
                onClick={assignDeck}
                disabled={assignSelection.size === 0 || isAssigning}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-violet-500 disabled:opacity-50"
              >
                {isAssigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send quest to {assignSelection.size || 'selected'} student{assignSelection.size === 1 ? '' : 's'}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete deck confirmation — themed, replaces window.confirm ── */}
      <AnimatePresence>
        {deckPendingDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
            onClick={() => !isDeletingDeck && setDeckPendingDelete(null)}
          >
            <motion.div
              ref={remove.modalRef}
              tabIndex={-1}
              onKeyDown={remove.onKeyDown}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              role="dialog"
              aria-modal="true"
              aria-label={`Delete deck ${deckPendingDelete.name}`}
              className="w-full max-w-sm rounded-[28px] border border-border bg-card p-6 shadow-xl outline-none"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-heading text-lg font-bold text-foreground">
                Delete “{deckPendingDelete.name}”?
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Students assigned to this deck will lose the quest. This can’t be undone.
              </p>
              <div className="mt-5 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDeckPendingDelete(null)}
                  disabled={isDeletingDeck}
                  className="rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted/60 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteDeck}
                  disabled={isDeletingDeck}
                  className="flex items-center gap-2 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:opacity-50"
                >
                  {isDeletingDeck ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete deck
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
