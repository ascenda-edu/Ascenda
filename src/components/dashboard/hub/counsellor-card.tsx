import Link from 'next/link';
import { CalendarPlus, MailOpen, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { HubCard } from './hub-card';
import { MeetingTime } from './meeting-time';

export interface CounsellorCardProps {
  /** Resolved from real profile data where possible; falls back to DEMO_COUNSELLOR upstream. */
  counsellor: { firstName: string; fullName: string };
  openThreads: number;
  unreadTotal: number;
  latestSubject: string | null;
  nextMeeting: {
    title: string | null;
    scheduledFor: string;
    location: string | null;
    status: 'proposed' | 'confirmed';
  } | null;
}

/**
 * Counsellor & inbox cell: the counsellor's presence, unread replies, the next
 * booked meeting, and the two ways to reach them.
 */
export function CounsellorCard({ counsellor, openThreads, unreadTotal, latestSubject, nextMeeting }: CounsellorCardProps) {
  const initials = counsellor.fullName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <HubCard
      eyebrow="Counsellor"
      title={`${counsellor.firstName}'s corner`}
      icon={MessageSquare}
      iconClassName="bg-feature-subtle text-feature ring-feature/25"
      action={{ label: 'Open inbox', href: '/inbox' }}
    >
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            {/* from-primary to-accent (not violet-400 → primary): both ends carry
                white at AA in BOTH themes, which a violet-400 stop does not. */}
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-xs font-bold text-primary-foreground shadow-e-1"
              aria-hidden
            >
              {initials}
            </div>
            <span
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-success"
              aria-label="Available today"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{counsellor.fullName}</p>
            <p className="text-label text-muted-foreground">Your counsellor · usually replies same-day</p>
          </div>
        </div>

        <Link
          href="/inbox"
          className={cn(
            'hover-lift group flex items-center gap-3 rounded-xl border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            unreadTotal > 0 ? 'border-feature/25 bg-feature-subtle' : 'border-border/70 bg-background/60'
          )}
        >
          <MailOpen
            className={cn('h-4 w-4 shrink-0', unreadTotal > 0 ? 'text-feature' : 'text-muted-foreground/60')}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {unreadTotal > 0
                ? `${unreadTotal} unread ${unreadTotal === 1 ? 'reply' : 'replies'}`
                : openThreads > 0
                  ? `${openThreads} open ${openThreads === 1 ? 'thread' : 'threads'}`
                  : 'No open threads'}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {latestSubject ?? 'Ask about essays, shortlists or anything in between.'}
            </p>
          </div>
          {unreadTotal > 0 ? (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-feature px-1.5 text-label font-bold text-feature-foreground">
              {unreadTotal}
            </span>
          ) : null}
        </Link>

        {nextMeeting ? (
          <div className="rounded-xl border border-border/70 bg-background/60 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="eyebrow">Next meeting</p>
              <span
                className={cn(
                  'rounded-full px-2 py-px text-label font-semibold',
                  nextMeeting.status === 'confirmed'
                    ? 'bg-success-subtle text-success'
                    : 'bg-warning-subtle text-warning'
                )}
              >
                {nextMeeting.status === 'confirmed' ? 'Confirmed' : 'Proposed'}
              </span>
            </div>
            {/* Time renders client-side (browser timezone) — this card is a
                server component and would otherwise bake in the server's TZ. */}
            <p className="mt-1 text-sm font-semibold text-foreground">
              <MeetingTime iso={nextMeeting.scheduledFor} />
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {[nextMeeting.title, nextMeeting.location].filter(Boolean).join(' · ') || `Catch-up with ${counsellor.firstName}`}
            </p>
          </div>
        ) : null}

        <div className="mt-auto pt-1">
          <Button asChild size="sm" variant={unreadTotal > 0 ? 'outline' : 'default'} className="w-full">
            <Link href="/appointment">
              <CalendarPlus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
              {nextMeeting ? 'Book another chat' : `Book a chat with ${counsellor.firstName}`}
            </Link>
          </Button>
        </div>
      </div>
    </HubCard>
  );
}
