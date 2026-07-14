'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CalendarPlus, Check, Mail, MessageSquare, Video, Users, Clock, type LucideIcon } from 'lucide-react';
import { DashboardShell } from '@/components/layout/shell';
import { PageHero } from '@/components/layout/page-hero';
import { Breadcrumbs } from '@/components/ui/breadcrumbs';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/hooks/useSupabase';
import { insertHelpRequest } from '@/lib/demo/help-request-client';
import { DEMO_COUNSELLOR } from '@/lib/demo/counsellor';

type TopicTone = 'sky' | 'violet' | 'rose' | 'emerald';
const TOPIC_TONE: Record<TopicTone, { swatch: string; activeBorder: string; text: string; chip: string }> = {
  sky: {
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 ring-1 ring-sky-500/20 dark:text-sky-400',
    activeBorder: 'border-sky-300/60 bg-sky-500/5 dark:border-sky-500/30',
    text: 'text-sky-600 dark:text-sky-400',
    chip: 'bg-sky-500/10 text-sky-600 border border-sky-200/60 dark:text-sky-400 dark:border-sky-500/20'
  },
  violet: {
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 ring-1 ring-violet-500/20 dark:text-violet-400',
    activeBorder: 'border-violet-300/60 bg-violet-500/5 dark:border-violet-500/30',
    text: 'text-violet-600 dark:text-violet-400',
    chip:
      'bg-violet-500/10 text-violet-600 border border-violet-200/60 dark:text-violet-400 dark:border-violet-500/20'
  },
  rose: {
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400',
    activeBorder: 'border-rose-300/60 bg-rose-500/5 dark:border-rose-500/30',
    text: 'text-rose-600 dark:text-rose-400',
    chip: 'bg-rose-500/10 text-rose-600 border border-rose-200/60 dark:text-rose-400 dark:border-rose-500/20'
  },
  emerald: {
    swatch:
      'flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20 dark:text-emerald-400',
    activeBorder: 'border-emerald-300/60 bg-emerald-500/5 dark:border-emerald-500/30',
    text: 'text-emerald-600 dark:text-emerald-400',
    chip:
      'bg-emerald-500/10 text-emerald-600 border border-emerald-200/60 dark:text-emerald-400 dark:border-emerald-500/20'
  }
};

const TOPICS: { id: string; label: string; icon: LucideIcon; tone: TopicTone }[] = [
  { id: 'university-choice', label: 'University choice', icon: Users, tone: 'sky' },
  { id: 'applications', label: 'Applications & essays', icon: MessageSquare, tone: 'violet' },
  { id: 'interview-prep', label: 'Interview prep', icon: Video, tone: 'rose' },
  { id: 'general', label: 'General check-in', icon: CalendarPlus, tone: 'emerald' }
];

const TIMES = ['09:00', '11:00', '13:00', '15:00', '17:00'];

const DURATIONS = ['30 min', '45 min', '60 min'];

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
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

    try {
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
    } catch (err) {
      console.error('appointment request submit failed', err);
      setError("Couldn't send your request. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
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
            { label: 'When', value: `${date} ${time}`, detail: duration },
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
        <div className="surface-card surface-card--static mt-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 ring-1 ring-emerald-500/20">
              <Check className="h-5 w-5" />
            </div>
            <div className="space-y-2">
              <p className="text-base font-semibold text-foreground">Got it — {DEMO_COUNSELLOR.firstName} has your request</p>
              <p className="text-sm text-muted-foreground">
                We&apos;ve sent your preferred time to {DEMO_COUNSELLOR.firstName}. Her reply will appear in your{' '}
                <Link href="/inbox" className="font-semibold text-primary hover:underline">
                  inbox
                </Link>{' '}
                — watch for the confirmation there.
              </p>
              <div className="rounded-xl bg-muted/40 p-4 text-sm text-foreground">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Notes shared with your counsellor</p>
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
        <section className="surface-card surface-card--static space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">Topic</p>
            <p className="text-sm text-muted-foreground">What would you like to discuss?</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TOPICS.map((option) => {
              const Icon = option.icon;
              const tone = TOPIC_TONE[option.tone];
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
                      ? cn(tone.activeBorder, 'text-foreground')
                      : 'border-border bg-background text-muted-foreground hover:border-border/80 hover:text-foreground'
                  )}
                >
                  <div className={tone.swatch}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className={cn(active && tone.text)}>{option.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="surface-card surface-card--static space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">When works for you?</p>
            <p className="text-sm text-muted-foreground">Pick a preferred date, time, and meeting length.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                required
                min={minDate}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Duration</span>
              <select
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {DURATIONS.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Preferred time</span>
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

        <section className="surface-card surface-card--static space-y-3">
          <div>
            <label
              htmlFor="appointment-notes"
              className="text-[11px] font-semibold uppercase tracking-[0.3em] text-muted-foreground"
            >
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
            className="w-full resize-none rounded-2xl border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
          <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </DashboardShell>
  );
}
