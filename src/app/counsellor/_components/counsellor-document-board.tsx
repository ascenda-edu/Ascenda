'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Check,
  Clock,
  FileText,
  GraduationCap,
  Mail,
  MessageSquare,
  Search,
  Send,
  UserRound
} from 'lucide-react';
import type { CounsellorDocument, CounsellorDocStatus } from '@/lib/data/student-demo-data';
import { useToast } from '@/components/ui/toast';
import { useSupabase } from '@/hooks/useSupabase';
import { insertNotification } from '@/lib/demo/help-request-client';

type NudgeTarget = 'student' | 'teacher' | 'registrar';

type NudgeState = Record<string, { target: NudgeTarget; at: number }>;

const NUDGE_STORAGE_KEY = 'ascenda-doc-nudges';

const NUDGE_LABELS: Record<NudgeTarget, { label: string; icon: typeof UserRound }> = {
  student: { label: 'Nudge student', icon: UserRound },
  teacher: { label: 'Nudge teacher', icon: GraduationCap },
  registrar: { label: 'Nudge registrar', icon: Building2 }
};

const formatNudgeAge = (at: number): string => {
  const sec = Math.max(1, Math.round((Date.now() - at) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
};

const STATUS_CONFIG: Record<CounsellorDocStatus, { icon: typeof Check; label: string; color: string; bg: string }> = {
  received: { icon: Check, label: 'Received', color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20' },
  pending: { icon: Clock, label: 'Pending', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-200/60 dark:border-amber-500/20' },
  overdue: { icon: AlertTriangle, label: 'Overdue', color: 'text-red-500', bg: 'bg-red-500/10 border-red-200/60 dark:border-red-500/20' }
};

const TYPE_ICON: Record<string, typeof FileText> = {
  transcript: GraduationCap,
  recommendation: Mail,
  essay: FileText,
  certificate: FileText,
  other: MessageSquare
};

type FilterStatus = CounsellorDocStatus | 'all';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface CounsellorDocumentBoardProps {
  documents: CounsellorDocument[];
}

export function CounsellorDocumentBoard({ documents }: CounsellorDocumentBoardProps) {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [nudges, setNudges] = useState<NudgeState>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast } = useToast();
  const supabase = useSupabase();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NUDGE_STORAGE_KEY);
      if (raw) setNudges(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(NUDGE_STORAGE_KEY, JSON.stringify(nudges));
    } catch {
      // ignore
    }
  }, [nudges]);

  // Counsellor nudges write a real notification to the student. For the
  // demo, the student is the same auth user as the counsellor; the
  // notification surfaces in the navbar bell after switching to student
  // view, which makes the demo claim ("the chase happens through the
  // platform") honest end-to-end.
  const handleNudge = async (doc: CounsellorDocument, target: NudgeTarget) => {
    if (busy) return;
    setBusy(doc.id);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) {
        showToast({ title: 'Please sign in to send a nudge', variant: 'error' });
        return;
      }

      const targetLabel =
        target === 'student' ? doc.studentName : target === 'teacher' ? 'the recommender' : 'the registrar';
      const askAsStudent =
        target === 'student'
          ? `Could you upload ${doc.documentName} when you have a sec?`
          : `Could you check in with ${targetLabel} about ${doc.documentName}? It's outstanding.`;

      // Notify the STUDENT's profile — a nudge on the counsellor's own row
      // would be visible only to the counsellor under notifications RLS.
      await insertNotification(supabase, {
        profile_id: doc.studentId,
        kind: 'doc_nudge',
        title:
          target === 'student'
            ? `Your counsellor is asking about ${doc.documentName}`
            : `Your counsellor is following up on ${doc.documentName}`,
        body: askAsStudent,
        // Land the student on their document manager so tapping the notification
        // takes them somewhere actionable (a null href renders a dead click).
        href: '/applications/documents'
      });

      setNudges((prev) => ({ ...prev, [doc.id]: { target, at: Date.now() } }));
      showToast({
        title: `Nudge logged · ${targetLabel}`,
        description: `${doc.documentName} · ${doc.studentName}`,
        variant: 'success'
      });
    } catch (err) {
      console.error('doc nudge failed', err);
      showToast({ title: "Couldn't send nudge", variant: 'error' });
    } finally {
      setBusy(null);
    }
  };

  const filtered = documents.filter((doc) => {
    if (statusFilter !== 'all' && doc.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        doc.studentName.toLowerCase().includes(q) ||
        doc.documentName.toLowerCase().includes(q) ||
        doc.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by student
  const grouped = new Map<string, CounsellorDocument[]>();
  for (const doc of filtered) {
    const list = grouped.get(doc.studentId) ?? [];
    list.push(doc);
    grouped.set(doc.studentId, list);
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student or document..."
            className="w-full rounded-full border border-border/60 bg-background/80 pl-9 pr-4 py-2 text-sm outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 focus:ring-1 focus:ring-primary/20"
          />
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'overdue', 'pending', 'received'] as const).map((status) => {
            const isActive = statusFilter === status;
            const cfg = status !== 'all' ? STATUS_CONFIG[status] : null;
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  isActive
                    ? status === 'all'
                      ? 'border-primary bg-primary text-primary-foreground'
                      : cn('border-transparent', cfg!.bg, cfg!.color)
                    : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted/60'
                )}
              >
                {status === 'all' ? `All (${documents.length})` : `${cfg!.label} (${documents.filter((d) => d.status === status).length})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Document groups */}
      {[...grouped.entries()].map(([studentId, docs]) => {
        const studentName = docs[0].studentName;
        return (
          <div key={studentId} className="surface-card surface-card--static space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={`/counsellor/students/${studentId}`}
                className="group inline-flex items-center gap-2 text-sm font-semibold text-foreground transition hover:text-primary"
              >
                {studentName}
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition group-hover:text-primary" aria-hidden />
              </Link>
              <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                {docs.length} doc{docs.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="space-y-2">
              {docs.map((doc) => {
                const cfg = STATUS_CONFIG[doc.status];
                const Icon = cfg.icon;
                const TypeIcon = TYPE_ICON[doc.type] ?? FileText;
                const nudge = nudges[doc.id];
                const canNudge = doc.status !== 'received';

                return (
                  <div
                    key={doc.id}
                    className={cn(
                      'rounded-2xl border px-4 py-3 transition hover:-translate-y-px hover:shadow-sm',
                      doc.status === 'overdue' ? 'border-red-200/40 bg-red-500/5 dark:border-red-500/15' : 'border-border/60 bg-background/60'
                    )}
                  >
                    <div className="flex items-center gap-4">
                      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', cfg.bg)}>
                        <TypeIcon className={cn('h-4 w-4', cfg.color)} />
                      </div>
                      <Link
                        href={`/counsellor/students/${studentId}?tab=documents`}
                        className="flex-1 min-w-0 group"
                      >
                        <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary">
                          {doc.documentName}
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">{doc.type}</p>
                      </Link>
                      <div className="flex items-center gap-3 shrink-0">
                        {doc.uploadedDate && (
                          <span className="text-xs text-muted-foreground">Uploaded {formatDate(doc.uploadedDate)}</span>
                        )}
                        {doc.status !== 'received' && doc.dueDate && (
                          <span className={cn('text-xs', doc.status === 'overdue' ? 'text-red-500 font-semibold' : 'text-muted-foreground')}>
                            Due {formatDate(doc.dueDate)}
                          </span>
                        )}
                        {nudge ? (
                          <span className="flex items-center gap-1 rounded-full border border-sky-200/60 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                            <Send className="h-3 w-3" />
                            Nudge sent · {formatNudgeAge(nudge.at)}
                          </span>
                        ) : (
                          <span className={cn('flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold', cfg.bg, cfg.color)}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        )}
                      </div>
                    </div>
                    {doc.notes && (
                      <p className="mt-2 text-[11px] italic text-muted-foreground/70" title={doc.notes}>
                        {doc.notes}
                      </p>
                    )}
                    {canNudge ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border/40 pt-2">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          Chase
                        </span>
                        {(['student', 'teacher', 'registrar'] as const).map((target) => {
                          const meta = NUDGE_LABELS[target];
                          const NudgeIcon = meta.icon;
                          const isActive = nudge?.target === target;
                          return (
                            <button
                              key={target}
                              type="button"
                              onClick={() => handleNudge(doc, target)}
                              disabled={busy === doc.id}
                              className={cn(
                                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:cursor-wait disabled:opacity-60',
                                isActive
                                  ? 'border-sky-300/70 bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                  : 'border-border/60 text-muted-foreground hover:border-primary/40 hover:bg-muted/60 hover:text-foreground'
                              )}
                            >
                              <NudgeIcon className="h-3 w-3" aria-hidden />
                              {meta.label}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {filtered.length === 0 && (
        <div className="rounded-[28px] border border-dashed border-border bg-muted/40 p-12 text-center">
          <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="font-semibold text-foreground">No documents found</p>
          <p className="mt-1 text-sm text-muted-foreground">Try adjusting your filters or search query.</p>
        </div>
      )}
    </div>
  );
}
