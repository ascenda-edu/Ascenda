'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CalendarPlus, Check, Mail, MessageSquare, Video, Users, Clock, type LucideIcon } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/hooks/useSupabase';
import { insertHelpRequest } from '@/lib/demo/help-request-client';
import { DEMO_COUNSELLOR } from '@/lib/demo/counsellor';

/**
 * ONE visual for all four topics. This was a four-hue Record — info / feature /
 * danger / success, one per topic — which is a nominal set wearing the status
 * palette: "Interview prep" was rendered in the overdue red purely because it
 * was third in the list. The icons already tell the four apart.
 *
 * The only real state on this control is SELECTED, and that is what the brand
 * accent below marks. Tone tokens are AA-verified in both themes (globals.css),
 * so no `dark:` variants are needed.
 */
const TOPIC_VISUAL = {
  swatch: 'flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary-ink ring-1 ring-primary/15',
  activeBorder: 'border-primary/30 bg-primary/5',
  text: 'text-primary-ink'
};

const TOPICS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'university-choice', label: 'University choice', icon: Users },
  { id: 'applications', label: 'Applications & essays', icon: MessageSquare },
  { id: 'interview-prep', label: 'Interview prep', icon: Video },
  { id: 'general', label: 'General check-in', icon: CalendarPlus }
];

const TIMES = ['09:00', '11:00', '13:00', '15:00', '17:00'];

const DURATIONS = ['30 min', '45 min', '60 min'];

function formatAppointmentWhen(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) return `${dateStr} ${timeStr}`.trim();
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  const when = new Date(year, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  if (Number.isNaN(when.getTime())) return `${dateStr} ${timeStr}`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'short' }).format(when);
}

export default function AppointmentPage() {
  const supabase = useSupabase();
  const [topic, setTopic] = useState<string>('university-choice');
  const [duration, setDuration] = useState<string>('30 min');
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Earliest bookable date as a LOCAL 'YYYY-MM-DD' string. `toISOString()` would
  // emit the UTC date, which rolls a day early/late either side of midnight.
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Synchronous `() => void` event-handler boundary around an async body. An
  // `async` function handed to `onClick`/`onSubmit` returns a promise the DOM
  // discards, so a rejection is swallowed and the user is told nothing; the
  // terminal `.catch`/`.finally` below is the only exit for a failure.
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!date || !time || submitting) return;
    setError(null);
    setSubmitting(true);

    const topicLabel = TOPICS.find((t) => t.id === topic)?.label ?? 'General check-in';
    const subject = `Appointment request: ${topicLabel}`;
    const body = [
      `I'd like to book a ${duration} appointment.`,
      `Preferred time: ${date} at ${time}.`,
      `Topic: ${topicLabel}.`,
      '',
      notes.trim() ? `Notes: ${notes.trim()}` : 'No additional notes.'
    ].join('\n');

    const run = async (): Promise<void> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        setError('Please sign in to request an appointment.');
        return;
      }

      // Appointments ride on the help-request channel: this lands in the
      // counsellor's queue and the student's inbox, and the counsellor copy is
      // created by a DB trigger (do not insert it here). No appointments table
      // exists yet, so this is the real persistence path.
      await insertHelpRequest(supabase, {
        student_profile_id: userId,
        subject,
        body
      });

      setSubmitted(true);
    };

    run()
      .catch((err: unknown) => {
        console.error('appointment request submit failed', err);
        setError("Couldn't send your request. Check your connection and try again.");
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  if (submitted) {
    return (
      <DashboardShell>
        <PageHero
          tone="student"
          eyebrow="Your counsellor"
          title="Request sent"
          description={`Your request is now in ${DEMO_COUNSELLOR.firstName}'s queue. She'll reply in your inbox to confirm the time.`}
          highlight="Pending confirmation"
          stats={[
            { label: 'Counsellor', value: DEMO_COUNSELLOR.fullName, detail: 'Your assigned counsellor' },
            { label: 'When', value: formatAppointmentWhen(date, time), detail: duration },
            { label: 'Topic', value: TOPICS.find((t) => t.id === topic)?.label ?? 'General', detail: 'Selected focus' }
          ]}
          breadcrumbs={<Breadcrumbs />}
          actions={
            <>
              <Button asChild size="sm" variant="outline">
                <Link href="/inbox">Open inbox</Link>
              </Button>
              <Button size="sm" onClick={() => setSubmitted(false)} variant="ghost">
                Request another time
              </Button>
            </>
          }
        />
        <div className="surface-card mt-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-success-subtle text-success ring-1 ring-success/25">
              <Check className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <p className="text-base font-semibold text-foreground">Got it — {DEMO_COUNSELLOR.firstName} has your request</p>
              <p className="text-sm text-muted-foreground">
                We&apos;ve sent your preferred time to {DEMO_COUNSELLOR.firstName}. Her reply will appear in your{' '}
                <Link href="/inbox" className="font-semibold text-primary-ink hover:underline">
                  inbox
                </Link>{' '}
                — watch for the confirmation there.
              </p>
              <div className="rounded-xl bg-muted/40 p-4 text-sm text-foreground">
                <p className="eyebrow">Notes shared with your counsellor</p>
                <p className="mt-1">{notes || '— No additional notes —'}</p>
              </div>
            </div>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <PageHero
        tone="student"
        eyebrow="Your counsellor"
        title={`Book a chat with ${DEMO_COUNSELLOR.firstName}`}
        description={`Pick a topic and a time that works for you. ${DEMO_COUNSELLOR.firstName} will confirm by email — usually within a day.`}
        highlight={`${DEMO_COUNSELLOR.fullName} · replies within a day`}
        stats={[
          { label: 'Counsellor', value: DEMO_COUNSELLOR.fullName, detail: 'Your assigned counsellor' },
          { label: 'Channel', value: 'Video / In-person', detail: 'Choose at the meeting' },
          { label: 'Slots', value: 'Mon–Fri', detail: '09:00–17:00 local time' }
        ]}
        breadcrumbs={<Breadcrumbs />}
      />

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <section className="surface-card space-y-4">
          <div>
            <p className="eyebrow">Topic</p>
            <p className="text-sm text-muted-foreground">What would you like to discuss?</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TOPICS.map((option) => {
              const Icon = option.icon;
              const active = topic === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTopic(option.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? cn(TOPIC_VISUAL.activeBorder, 'text-foreground')
                      : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground'
                  )}
                >
                  <div className={TOPIC_VISUAL.swatch}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className={cn(active && TOPIC_VISUAL.text)}>{option.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="surface-card space-y-4">
          <div>
            <p className="eyebrow">When works for you?</p>
            <p className="text-sm text-muted-foreground">Pick a preferred date, time, and meeting length.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="eyebrow">Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
                min={minDate}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            {/* A div, not a label: the trigger is a button, which takes its
                accessible name from its contents rather than from a wrapping
                label — hence the aria-label. The overrides match the date input
                beside it (rounded-xl, px-3 py-2) so the pair still reads as one row. */}
            <div className="block space-y-1.5">
              <span className="eyebrow">Duration</span>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger aria-label="Duration" className="rounded-xl px-3 py-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((value) => (
                    <SelectItem key={value} value={value}>{value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <span className="eyebrow">Preferred time</span>
            <div className="flex flex-wrap gap-2">
              {TIMES.map((value) => {
                const active = time === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setTime(value)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                      active
                        ? 'border-primary/30 bg-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground'
                    )}
                  >
                    <Clock className="h-3 w-3" aria-hidden />
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        <section className="surface-card space-y-3">
          <div>
            <label htmlFor="appointment-notes" className="eyebrow">
              Notes for your counsellor
            </label>
            <p className="text-sm text-muted-foreground">Optional — anything specific you want to cover?</p>
          </div>
          <textarea
            id="appointment-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={4}
            placeholder="e.g. I want to talk through my UK reach list and Imperial interview prep."
            className="w-full resize-none rounded-2xl border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <Mail className="mr-1 inline h-3 w-3" /> {DEMO_COUNSELLOR.firstName} will confirm in your inbox.
          </p>
          <div className="flex items-center gap-2">
            {(!date || !time) && (
              <p className="text-xs text-muted-foreground">Pick a date and time to continue.</p>
            )}
            <Button type="button" size="sm" variant="ghost" asChild>
              <Link href="/dashboard">Cancel</Link>
            </Button>
            <Button type="submit" size="sm" disabled={!date || !time || submitting}>
              {submitting ? 'Sending…' : 'Send request'}
            </Button>
          </div>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </DashboardShell>
  );
}
