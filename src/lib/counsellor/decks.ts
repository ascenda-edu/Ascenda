// Deck data-access layer — counsellor-built university "decks" (video-game
// themed programme collections) and their assignments to students.
//
// Tables live in 20260713150000_counsellor_decks_saved_searches.sql; they are
// not in the generated database.ts yet, so queries cast through `any` (same
// pattern as lib/demo/help-request-client.ts). Domain types for the raw rows
// are in src/lib/types/demo-tables.ts.

import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import type {
  CounsellorDeckInsert,
  CounsellorDeckRow,
  DeckAssignmentInsert,
  DeckAssignmentRow,
  DeckCardFit,
  DeckCardRarity,
  DeckProgramInsert,
  DeckProgramRow,
  DeckTheme,
} from '@/lib/types/demo-tables';
import { canActAsCounsellor } from '@/lib/api/guards';
import { nameMap, resolvePrograms } from '@/lib/counsellor/data';

type Client = SupabaseClient<Database>;
const tbl = (supabase: Client, name: string) => (supabase as any).from(name);

type DbError = { message: string };
type DbResult<T> = { data: T | null; error: DbError | null };

// ── view types ────────────────────────────────────────────────────────────────

export interface DeckCard {
  id: string; // counsellor_deck_programs row id
  programId: string;
  rarity: DeckCardRarity;
  fit: DeckCardFit;
  note: string | null;
  courseName: string;
  university: string;
  country: string;
}

export interface DeckAssignee {
  assignmentId: string;
  profileId: string;
  name: string;
  flag: string;
  assignedAt: string;
}

export interface CounsellorDeck {
  id: string;
  counsellorId: string;
  name: string;
  description: string | null;
  theme: DeckTheme;
  createdAt: string;
  cards: DeckCard[];
  assignees: DeckAssignee[];
}

export interface StudentQuest {
  programId: string;
  courseName: string;
  university: string;
  country: string;
  rarity: DeckCardRarity;
  fit: DeckCardFit;
  note: string | null;
  cleared: boolean; // student has started an application for this programme
}

export interface StudentQuestDeck {
  deckId: string;
  deckName: string;
  theme: DeckTheme;
  message: string | null;
  assignedAt: string;
  quests: StudentQuest[];
}

const unwrap = <T,>(
  res: { data: T | null; error: { message?: string } | null },
  label: string
): T | null => {
  if (res.error) {
    throw new Error(`deck data: ${label} query failed — ${res.error.message ?? 'unknown error'}`);
  }
  return res.data;
};

// ── route guard ───────────────────────────────────────────────────────────────

// Shared auth preamble for the /api/counsellor/decks/* route handlers: 401 when
// signed out, 403 when the caller cannot act as a counsellor (applied uniformly
// to POST and DELETE — RLS ownership policies are the real enforcement; this is
// defense in depth). Returns the user on success, or the response to send.
export async function requireCounsellor(
  supabase: Client
): Promise<{ user: User; errorResponse: null } | { user: null; errorResponse: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { user: null, errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (!(await canActAsCounsellor(supabase, user))) {
    return { user: null, errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { user, errorResponse: null };
}

// ── counsellor side ───────────────────────────────────────────────────────────

// Loads the signed-in counsellor's decks with resolved programme cards and the
// students each deck is assigned to.
export async function loadDecks(supabase: Client, counsellorId: string): Promise<CounsellorDeck[]> {
  const deckRows = (unwrap(
    await tbl(supabase, 'counsellor_decks')
      .select('*')
      .eq('counsellor_id', counsellorId)
      .order('created_at', { ascending: false }),
    'decks'
  ) ?? []) as CounsellorDeckRow[];
  if (deckRows.length === 0) return [];

  const deckIds = deckRows.map((d) => d.id);
  const [cardRows, assignmentRows] = (await Promise.all([
    tbl(supabase, 'counsellor_deck_programs')
      .select('*')
      .in('deck_id', deckIds)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .then((res: any) => unwrap(res, 'deck cards') ?? []),
    tbl(supabase, 'deck_assignments')
      .select('*')
      .in('deck_id', deckIds)
      .then((res: any) => unwrap(res, 'deck assignments') ?? []),
  ])) as [DeckProgramRow[], DeckAssignmentRow[]];

  const [programs, students] = await Promise.all([
    resolvePrograms(supabase, cardRows.map((c) => c.program_id)),
    nameMap(supabase, assignmentRows.map((a) => a.student_profile_id)),
  ]);

  return deckRows.map((deck) => ({
    id: deck.id,
    counsellorId: deck.counsellor_id,
    name: deck.name,
    description: deck.description,
    theme: deck.theme ?? {},
    createdAt: deck.created_at,
    cards: cardRows
      .filter((c) => c.deck_id === deck.id)
      .map((c) => {
        const info = programs.get(c.program_id);
        return {
          id: c.id,
          programId: c.program_id,
          rarity: c.rarity,
          fit: c.fit,
          note: c.note,
          courseName: info?.courseName ?? 'Programme',
          university: info?.university ?? 'University',
          country: info?.country ?? '',
        };
      }),
    assignees: assignmentRows
      .filter((a) => a.deck_id === deck.id)
      .map((a) => {
        const student = students.get(a.student_profile_id);
        return {
          assignmentId: a.id,
          profileId: a.student_profile_id,
          name: student?.name ?? 'Student',
          flag: student?.flag ?? '🌍',
          assignedAt: a.created_at,
        };
      }),
  }));
}

// ── counsellor writes ─────────────────────────────────────────────────────────
// All writes to the untyped deck tables live here so the API routes stay free
// of `(supabase as any)` casts. Results keep the raw supabase { data, error }
// shape so the routes' response contracts are unchanged.

export type CreatedDeck = Pick<CounsellorDeckRow, 'id' | 'name' | 'description' | 'theme' | 'created_at'>;

export async function createDeck(supabase: Client, deck: CounsellorDeckInsert): Promise<DbResult<CreatedDeck>> {
  return tbl(supabase, 'counsellor_decks')
    .insert(deck)
    .select('id, name, description, theme, created_at')
    .single();
}

// RLS (counsellor_decks_delete) also restricts the delete to decks owned by
// the caller; the counsellor_id filter is defense in depth.
export async function deleteDeck(
  supabase: Client,
  deckId: string,
  counsellorId: string
): Promise<{ error: DbError | null }> {
  const { error } = await tbl(supabase, 'counsellor_decks')
    .delete()
    .eq('id', deckId)
    .eq('counsellor_id', counsellorId);
  return { error };
}

export type UpsertedDeckCard = Pick<
  DeckProgramRow,
  'id' | 'deck_id' | 'program_id' | 'rarity' | 'fit' | 'note' | 'position'
>;

// Add a programme card to a deck (or update it when deck_id+program_id already
// exists). New cards are appended: position = current max + 1, so decks keep a
// stable, deterministic order. The read-then-write has a small race (two
// concurrent adds can pick the same position) — acceptable for this feature;
// the loaders break position ties on created_at.
export async function upsertDeckCard(
  supabase: Client,
  card: DeckProgramInsert
): Promise<DbResult<UpsertedDeckCard>> {
  const { data: positionRows, error: positionError } = (await tbl(supabase, 'counsellor_deck_programs')
    .select('program_id, position')
    .eq('deck_id', card.deck_id)) as DbResult<Pick<DeckProgramRow, 'program_id' | 'position'>[]>;
  if (positionError) {
    return { data: null, error: positionError };
  }
  const rows = positionRows ?? [];
  const existing = rows.find((r) => r.program_id === card.program_id);
  const position = existing
    ? existing.position // keep an existing card's slot on re-upsert
    : rows.reduce((max, r) => Math.max(max, r.position), -1) + 1;

  return tbl(supabase, 'counsellor_deck_programs')
    .upsert({ ...card, position }, { onConflict: 'deck_id,program_id' })
    .select('id, deck_id, program_id, rarity, fit, note, position')
    .single();
}

// Remove a card by row id. RLS (counsellor_deck_programs_write) restricts the
// delete to decks owned by the caller.
export async function removeDeckCard(supabase: Client, cardId: string): Promise<{ error: DbError | null }> {
  const { error } = await tbl(supabase, 'counsellor_deck_programs').delete().eq('id', cardId);
  return { error };
}

export type CreatedAssignment = Pick<DeckAssignmentRow, 'id' | 'deck_id' | 'student_profile_id' | 'created_at'>;

// Assign a deck to one or more students. Students who already have the deck
// are skipped so re-assigning is idempotent and doesn't re-fire the
// trg_deck_assignment_notify notification trigger for them.
export async function assignDeck(
  supabase: Client,
  deckId: string,
  studentIds: string[],
  assignedBy: string,
  message: string | null
): Promise<{ assignments: CreatedAssignment[]; skipped: number; error: DbError | null }> {
  const { data: existing, error: existingError } = (await tbl(supabase, 'deck_assignments')
    .select('student_profile_id')
    .eq('deck_id', deckId)
    .in('student_profile_id', studentIds)) as DbResult<Pick<DeckAssignmentRow, 'student_profile_id'>[]>;
  if (existingError) {
    return { assignments: [], skipped: 0, error: existingError };
  }

  const alreadyAssigned = new Set((existing ?? []).map((r) => r.student_profile_id));
  const newStudentIds = [...new Set(studentIds)].filter((id) => !alreadyAssigned.has(id));
  if (newStudentIds.length === 0) {
    return { assignments: [], skipped: studentIds.length, error: null };
  }

  const inserts: DeckAssignmentInsert[] = newStudentIds.map((studentId) => ({
    deck_id: deckId,
    student_profile_id: studentId,
    assigned_by: assignedBy,
    message,
  }));
  const { data, error } = (await tbl(supabase, 'deck_assignments')
    .insert(inserts)
    .select('id, deck_id, student_profile_id, created_at')) as DbResult<CreatedAssignment[]>;
  if (error) {
    return { assignments: [], skipped: 0, error };
  }
  return { assignments: data ?? [], skipped: alreadyAssigned.size, error: null };
}

// Unassign by assignment row id. RLS (deck_assignments_write) restricts the
// delete to decks owned by the caller.
export async function unassignDeck(supabase: Client, assignmentId: string): Promise<{ error: DbError | null }> {
  const { error } = await tbl(supabase, 'deck_assignments').delete().eq('id', assignmentId);
  return { error };
}

// ── student side ──────────────────────────────────────────────────────────────

// Loads the decks assigned to a student as "quest logs": each assigned deck's
// programmes, with cleared = the student already has an application for it.
export async function loadStudentQuestDecks(
  supabase: Client,
  studentProfileId: string
): Promise<StudentQuestDeck[]> {
  const assignments = (unwrap(
    await tbl(supabase, 'deck_assignments')
      .select('*')
      .eq('student_profile_id', studentProfileId)
      .order('created_at', { ascending: false }),
    'student assignments'
  ) ?? []) as DeckAssignmentRow[];
  if (assignments.length === 0) return [];

  const deckIds = assignments.map((a) => a.deck_id);
  const [deckRows, cardRows, applicationRows] = (await Promise.all([
    tbl(supabase, 'counsellor_decks')
      .select('id, name, theme')
      .in('id', deckIds)
      .then((res: any) => unwrap(res, 'assigned decks') ?? []),
    tbl(supabase, 'counsellor_deck_programs')
      .select('*')
      .in('deck_id', deckIds)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
      .then((res: any) => unwrap(res, 'assigned deck cards') ?? []),
    supabase
      .from('applications')
      .select('program_id')
      .eq('profile_id', studentProfileId)
      .then((res) => unwrap(res, 'student applications') ?? []),
  ])) as [Pick<CounsellorDeckRow, 'id' | 'name' | 'theme'>[], DeckProgramRow[], { program_id: string }[]];

  const programs = await resolvePrograms(supabase, cardRows.map((c) => c.program_id));
  const appliedPrograms = new Set(applicationRows.map((a) => a.program_id));
  const decksById = new Map(deckRows.map((d) => [d.id, d]));

  return assignments
    .filter((a) => decksById.has(a.deck_id))
    .map((a) => {
      const deck = decksById.get(a.deck_id)!;
      return {
        deckId: deck.id,
        deckName: deck.name,
        theme: deck.theme ?? {},
        message: a.message,
        assignedAt: a.created_at,
        quests: cardRows
          .filter((c) => c.deck_id === deck.id)
          .map((c) => {
            const info = programs.get(c.program_id);
            return {
              programId: c.program_id,
              courseName: info?.courseName ?? 'Programme',
              university: info?.university ?? 'University',
              country: info?.country ?? '',
              rarity: c.rarity,
              fit: c.fit,
              note: c.note,
              cleared: appliedPrograms.has(c.program_id),
            };
          }),
      };
    });
}
