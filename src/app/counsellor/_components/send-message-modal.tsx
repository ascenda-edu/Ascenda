'use client';

import { useEffect, useMemo, useState } from 'react';
import { Send, Sparkles, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useSupabase } from '@/hooks/useSupabase';
import { insertHelpRequest } from '@/lib/demo/help-request-client';
import { DEMO_COUNSELLOR } from '@/lib/demo/counsellor';

// Counsellor-initiated message context. Slim by design: the modal just needs
// who it's going to and an optional reason hint to pre-fill the draft.
export interface SendMessageStudent {
  id: string;             // real profiles.id for the student (from loadCohort/loadStudentById)
  firstName: string;
  lastName: string;
}

export type SendMessageReason = 'general' | 'portfolio_balance' | 'document_chase' | 'profile_gap';

interface SendMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: SendMessageStudent | null;
  reason?: SendMessageReason;
}

const REASON_LABEL: Record<SendMessageReason, string> = {
  general: 'Touching base',
  portfolio_balance: 'Application list review',
  document_chase: 'Document chase',
  profile_gap: 'Profile follow-up'
};

const draftFor = (
  student: SendMessageStudent,
  reason: SendMessageReason
): { subject: string; body: string } => {
  const greeting = `Hi ${student.firstName},`;
  const sign = `\n\nBest,\n${DEMO_COUNSELLOR.firstName}`;

  switch (reason) {
    case 'portfolio_balance':
      return {
        subject: 'Let’s review your application list',
        body: `${greeting}\n\nI’ve been looking through your applications and want to talk through the balance — a few of your picks are stretches and I think we should make sure you have strong middle-ground options too.\n\nCould we book 15 minutes this week?${sign}`
      };
    case 'document_chase':
      return {
        subject: 'Quick chase on outstanding documents',
        body: `${greeting}\n\nI noticed a couple of documents are still outstanding for your applications. Could you upload them this week so we stay ahead of the deadlines?${sign}`
      };
    case 'profile_gap':
      return {
        subject: 'A few profile sections to wrap up',
        body: `${greeting}\n\nA quick reminder — your profile is missing a few sections. Filling them in will unlock better match suggestions and keep your application strategy on track.${sign}`
      };
    case 'general':
    default:
      return {
        subject: 'Touching base',
        body: `${greeting}\n\n${sign}`
      };
  }
};

export function SendMessageModal({
  open,
  onOpenChange,
  student,
  reason = 'general'
}: SendMessageModalProps) {
  const supabase = useSupabase();
  const { showToast } = useToast();

  const initialDraft = useMemo(
    () => (student ? draftFor(student, reason) : { subject: '', body: '' }),
    [student, reason]
  );

  const [subject, setSubject] = useState(initialDraft.subject);
  const [body, setBody] = useState(initialDraft.body);
  const [submitting, setSubmitting] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  useEffect(() => {
    if (open && student) {
      const next = draftFor(student, reason);
      setSubject(next.subject);
      setBody(next.body);
      setShowDiscardConfirm(false);
    }
  }, [open, student, reason]);

  if (!student) return null;

  // Escape/backdrop/Cancel would otherwise silently discard an edited draft.
  // Only prompt when the user has actually changed the pre-filled text —
  // closing an untouched draft shouldn't nag. Themed in-modal confirm instead
  // of an OS window.confirm.
  const handleOpenChange = (next: boolean) => {
    if (!next && !submitting) {
      const dirty = body !== initialDraft.body || subject !== initialDraft.subject;
      if (dirty) {
        setShowDiscardConfirm(true);
        return;
      }
    }
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const counsellorId = userData?.user?.id;
      if (!counsellorId) {
        showToast({ title: 'Please sign in to send a message', variant: 'error' });
        return;
      }

      const finalSubject = subject.trim() || initialDraft.subject;
      const finalBody = body.trim() || initialDraft.body;

      // The thread belongs to the real student (student.id) and is owned by the
      // sending counsellor. request.body IS the opening message (the thread view
      // renders it attributed to initiated_by), so no separate seed row is
      // needed. The trg_help_request_notify trigger fires a 'counsellor_message'
      // notification to the student's inbox.
      await insertHelpRequest(supabase, {
        student_profile_id: student.id,
        counsellor_profile_id: counsellorId,
        subject: finalSubject,
        body: finalBody,
        initiated_by: 'counsellor'
      });

      showToast({
        title: `Sent to ${student.firstName}`,
        description: 'They’ll see it in their inbox.',
        variant: 'success'
      });
      onOpenChange(false);
    } catch (err) {
      console.error('counsellor message submit failed', err);
      showToast({
        title: 'Couldn’t send message',
        description: 'Check your connection and try again',
        variant: 'error'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="w-full max-w-2xl overflow-visible">
        {/* Close affordance */}
        <button
          type="button"
          onClick={() => handleOpenChange(false)}
          aria-label="Close"
          className="absolute right-4 top-4 z-raised flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="border-b border-border px-7 py-5">
          <div className="eyebrow-accent flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {REASON_LABEL[reason]}
          </div>
          <DialogTitle className="mt-1.5 leading-7 text-foreground">
            Message {student.firstName} {student.lastName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Lands in {student.firstName}’s inbox with a notification badge.
          </p>
        </div>

        {/* Body */}
        <div className="space-y-5 px-7 py-6">
          <div className="space-y-2">
            <label htmlFor="sm-subject" className="text-xs font-semibold text-foreground">
              Subject
            </label>
            <input
              id="sm-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className="form-input rounded-xl py-2.5"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="sm-body" className="text-xs font-semibold text-foreground">
                Message
              </label>
              <span className="eyebrow-accent inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5">
                <Sparkles className="h-3 w-3" aria-hidden />
                AI draft
              </span>
            </div>
            <textarea
              id="sm-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={10}
              className="form-input resize-y rounded-xl leading-relaxed"
            />
            <p className="text-label text-muted-foreground">
              Edit anything before sending. {student.firstName} sees this verbatim.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/30 px-7 py-4">
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit} disabled={submitting || !body.trim()}>
            <Send className="mr-1.5 h-3.5 w-3.5" />
            {submitting ? 'Sending…' : `Send to ${student.firstName}`}
          </Button>
        </div>

        {/* Discard confirmation — themed in-modal, replaces window.confirm */}
        {showDiscardConfirm ? (
          <div className="absolute inset-0 z-sticky flex items-center justify-center rounded-[inherit] bg-background/80 p-6 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-e-4">
              <p className="text-sm font-semibold text-foreground">Discard this message?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Your edits to this draft will be lost.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowDiscardConfirm(false)}>
                  Keep editing
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    onOpenChange(false);
                  }}
                >
                  Discard
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
