'use client';

import { useState } from 'react';
import { MessageSquare, Flag, RefreshCw, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CounsellorNote } from '@/lib/counsellor/types';
import { NOTE_VISUAL } from '@/lib/theme/categories';

interface NotesPanelProps {
  notes: CounsellorNote[];
  studentId: string;
}

// Colours from NOTE_VISUAL (the note tone system of record); the icons stay local
// because this composer uses RefreshCw for updates rather than the shared arrow.
const TYPE_CONFIG = {
  session: {
    icon: MessageSquare,
    color: NOTE_VISUAL.session.text,
    bg: NOTE_VISUAL.session.bg,
    label: 'Session note',
    helper: 'Notes from a 1:1 meeting (what was discussed, next steps).'
  },
  flag: {
    icon: Flag,
    color: NOTE_VISUAL.flag.text,
    bg: NOTE_VISUAL.flag.bg,
    label: 'Flag',
    helper: 'Mark a concern that needs follow-up (missed deadlines, at-risk signals).'
  },
  update: {
    icon: RefreshCw,
    color: NOTE_VISUAL.update.text,
    bg: NOTE_VISUAL.update.bg,
    label: 'Update',
    helper: 'Quick FYI — status change, new doc, parent contact, etc.'
  }
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export const NotesPanel = ({ notes: seedNotes, studentId }: NotesPanelProps) => {
  const [notes, setNotes] = useState<CounsellorNote[]>(seedNotes);
  const [newNote, setNewNote] = useState('');
  const [noteType, setNoteType] = useState<'session' | 'flag' | 'update'>('session');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Synchronous `() => void` event-handler boundary around an async body: an
  // `async` function handed to `onClick` returns a promise the DOM discards, so
  // a rejection would be swallowed entirely.
  const addNote = (): void => {
    const body = newNote.trim();
    if (!body || saving) return;
    setSaving(true);
    setSaveError(null);

    // Optimistic insert; reconciled with the server row on success.
    const optimistic: CounsellorNote = { id: `local-${Date.now()}`, date: new Date().toISOString(), content: body, type: noteType };
    setNotes((prev) => [optimistic, ...prev]);
    setNewNote('');

    // The rollback used to be the WHOLE failure path: the composer was already
    // cleared, so a failed save deleted the optimistic row and the counsellor's
    // typed text with it, with nothing shown to say the note had not saved. Put
    // the text back and say so.
    const rollBack = (message: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== optimistic.id));
      setNewNote((current) => (current.trim() ? current : body));
      setSaveError(message);
    };

    const run = async (): Promise<void> => {
      const res = await fetch('/api/counsellor/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, body, noteType }),
      });
      if (!res.ok) {
        rollBack("Couldn't save that note — it hasn't been recorded. Try again.");
        return;
      }
      const { note } = await res.json();
      setNotes((prev) => prev.map((n) => (n.id === optimistic.id ? note : n)));
    };

    run()
      .catch(() => {
        rollBack("Couldn't reach the server — the note hasn't been saved. Try again.");
      })
      .finally(() => {
        setSaving(false);
      });
  };

  return (
    <div className="space-y-6">
      {/* New note composer */}
      <div className="surface-card space-y-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Add note</p>
          <p className="text-xs text-muted-foreground">Pick a type so this note shows up in the right place later.</p>
        </div>

        {/* Type selector */}
        <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-e-1">
          {(['session', 'flag', 'update'] as const).map((type) => {
            const cfg = TYPE_CONFIG[type];
            return (
              <button
                key={type}
                onClick={() => setNoteType(type)}
                title={cfg.helper}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition',
                  noteType === type
                    ? 'bg-primary text-primary-foreground shadow-e-1'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <cfg.icon className="h-3.5 w-3.5" />
                {cfg.label}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground italic">{TYPE_CONFIG[noteType].helper}</p>

        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Write your note here…"
          rows={3}
          className="form-input resize-none p-3"
        />

        {saveError ? (
          <p className="text-xs font-medium text-danger" role="alert">
            {saveError}
          </p>
        ) : null}

        <div className="flex justify-end">
          <button
            onClick={addNote}
            disabled={!newNote.trim() || saving}
            className="flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-e-1 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PlusCircle className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div className="space-y-3">
        {notes.map((note) => {
          const cfg = TYPE_CONFIG[note.type];
          const Icon = cfg.icon;
          return (
            <div key={note.id} className="flex gap-3 rounded-2xl border border-border bg-background p-4">
              <div className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl', cfg.bg)}>
                <Icon className={cn('h-4 w-4', cfg.color)} />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={cn('rounded-full border px-2 py-0.5 text-label font-semibold', cfg.bg, cfg.color)}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatDate(note.date)}</span>
                </div>
                <p className="text-sm text-foreground">{note.content}</p>
              </div>
            </div>
          );
        })}
        {notes.length === 0 && (
          <div className="rounded-4xl border border-dashed border-border bg-muted p-8 text-center">
            <p className="text-sm text-muted-foreground">No notes yet. Add your first note above.</p>
          </div>
        )}
      </div>
    </div>
  );
};
