'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles, Send, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useSupabase } from '@/hooks/useSupabase';
import { insertHelpRequest } from '@/lib/demo/help-request-client';

// Generic context shape — works for any caller (priority board item, rec letter,
// application detail row). Keep this small; if the modal needs more it should
// fetch it from the DB on open rather than thread props through every call site.
export interface HelpRequestModalApp {
  id: string;
  university: string;
  program: string;
  progress?: number;
  nextDeadline?: string;
  tasksRemaining?: number;
  platform?: string;
}

interface HelpRequestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  app: HelpRequestModalApp | null;
}

const draftFor = (app: HelpRequestModalApp): { subject: string; body: string } => {
  const subject = `Help with my ${app.university} application`;
  const progressLine =
    typeof app.progress === 'number' && app.progress > 0
      ? `I'm about ${app.progress}% through the requirements`
      : "I'm just getting started";
  const tasksLine =
    typeof app.tasksRemaining === 'number' && app.tasksRemaining > 0
      ? ` and have ${app.tasksRemaining} open task${app.tasksRemaining === 1 ? '' : 's'}`
      : '';
  const deadlineLine = app.nextDeadline
    ? `My next deadline is ${app.nextDeadline}.`
    : "There's no hard deadline yet, but I'd like to stay ahead of it.";

  const lines = [
    `Hi,`,
    '',
    `I'm working on my ${app.university} application (${app.program}). ${progressLine}${tasksLine}.`,
    deadlineLine,
    '',
    "Could we book a 15-minute call this week to talk it through? I'd like to focus on the personal statement and reference timing.",
    '',
    'Thanks!'
  ];

  return { subject, body: lines.join('\n') };
};

export function HelpRequestModal({ open, onOpenChange, app }: HelpRequestModalProps) {
  const supabase = useSupabase();
  const { showToast } = useToast();

  const initialDraft = useMemo(() => (app ? draftFor(app) : { subject: '', body: '' }), [app]);

  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.body);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && app) {
      const next = draftFor(app);
      setSubject(next.subject);
      setBody(next.body);
    }
  }, [open, app]);

  if (!app) return null;

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        showToast({ title: 'Please sign in to send a request', variant: 'error' });
        return;
      }

      const inserted = await insertHelpRequest(supabase, {
        student_profile_id: userId,
        application_id: app.id,
        university: app.university,
        program: app.program,
        subject: subject.trim() || initialDraft.subject,
        body: body.trim() || initialDraft.body
      });

      try {
        sessionStorage.setItem('ascenda-last-help-request-id', inserted.id);
      } catch {
        // ignore
      }

      showToast({
        title: 'Sent — your counsellor will respond shortly',
        description: `Tracked under ${app.university}`,
        variant: 'success'
      });
      onOpenChange(false);
    } catch (err) {
      console.error('help request submit failed', err);
      showToast({
        title: "Couldn't send request",
        description: 'Check your connection and try again',
        variant: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-2xl overflow-visible">
        {/* Close affordance */}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="border-b border-border px-7 py-5">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-primary">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            Request counsellor help
          </div>
          <DialogTitle className="mt-1.5 leading-7 text-foreground">
            {app.university}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {app.program}
            {app.platform ? ` · ${app.platform}` : null}
            {typeof app.progress === 'number' ? ` · ${app.progress}% fit` : null}
            {typeof app.tasksRemaining === 'number' && app.tasksRemaining > 0
              ? ` · ${app.tasksRemaining} open task${app.tasksRemaining === 1 ? '' : 's'}`
              : null}
          </p>
        </div>

        {/* Body */}
        <div className="space-y-5 px-7 py-6">
          <div className="space-y-2">
            <label htmlFor="hr-subject" className="text-xs font-semibold text-foreground">
              Subject
            </label>
            <input
              id="hr-subject"
              name="subject"
              type="text"
              autoComplete="off"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="hr-body" className="text-xs font-semibold text-foreground">
                Message
              </label>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                <Sparkles className="h-3 w-3" aria-hidden />
                AI draft
              </span>
            </div>
            <textarea
              id="hr-body"
              name="message"
              autoComplete="off"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={10}
              className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            />
            <p className="text-[11px] text-muted-foreground">
              Edit anything before sending. Your counsellor sees this verbatim in their inbox.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-7 py-4">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !body.trim()}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {submitting ? 'Sending…' : 'Send to counsellor'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
