'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MessageSquare, Flag, RefreshCw, Pin, PinOff, EyeOff, Eye, Settings2, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface ActivityItem {
  id: string;
  date: string;
  content: string;
  type: 'session' | 'flag' | 'update';
  studentName: string;
  studentId: string;
  studentFlag: string;
}

interface ActivityFeedProps {
  activity: ActivityItem[];
}

const TYPE_CONFIG = {
  session: { icon: MessageSquare, color: 'text-violet-600', bg: 'bg-violet-500/10', label: 'Session' },
  flag: { icon: Flag, color: 'text-amber-600', bg: 'bg-amber-500/10', label: 'Flag' },
  update: { icon: RefreshCw, color: 'text-sky-600', bg: 'bg-sky-500/10', label: 'Update' }
};

function formatRelative(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInSecs = Math.floor(diffInMs / 1000);
  const diffInMins = Math.floor(diffInSecs / 60);
  const diffInHours = Math.floor(diffInMins / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInSecs < 60) return 'just now';
  if (diffInMins < 60) return `${diffInMins}m ago`;
  if (diffInHours < 24) return `${diffInHours}h ago`;
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

// Get unique students from activity list
function getStudents(activity: ActivityItem[]) {
  const seen = new Set<string>();
  return activity
    .filter((a) => { if (seen.has(a.studentId)) return false; seen.add(a.studentId); return true; })
    .map((a) => ({ id: a.studentId, name: a.studentName, flag: a.studentFlag }));
}

export const ActivityFeed = ({ activity }: ActivityFeedProps) => {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [manageOpen, setManageOpen] = useState(false);

  const students = getStudents(activity);

  const togglePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleHide = (id: string) => {
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // Filter out hidden students, sort pinned to top
  const visible = activity
    .filter((a) => !hiddenIds.has(a.studentId))
    .sort((a, b) => {
      const aPinned = pinnedIds.has(a.studentId) ? 0 : 1;
      const bPinned = pinnedIds.has(b.studentId) ? 0 : 1;
      if (aPinned !== bPinned) return aPinned - bPinned;
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

  const shown = visible.slice(0, 5);
  const extra = visible.length - shown.length;

  return (
    <div className="space-y-3">
      {/* Manage toggle */}
      <div className="flex items-center justify-end">
        <button
          onClick={() => setManageOpen((o) => !o)}
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition hover:-translate-y-0.5',
            manageOpen
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border/60 bg-background/60 text-muted-foreground hover:text-foreground'
          )}
        >
          <Settings2 className="h-3 w-3" />
          Manage
          <ChevronDown className={cn('h-3 w-3 transition', manageOpen && 'rotate-180')} />
        </button>
      </div>

      {/* Manage panel */}
      <AnimatePresence>
        {manageOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-3 space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground px-1 pb-0.5">
                Students in feed
              </p>
              {students.map(({ id, name, flag }) => {
                const isPinned = pinnedIds.has(id);
                const isHidden = hiddenIds.has(id);
                return (
                  <div
                    key={id}
                    className={cn(
                      'flex items-center gap-2 rounded-xl px-2 py-1.5 transition',
                      isHidden ? 'opacity-40' : 'bg-background/60'
                    )}
                  >
                    <span className="text-sm">{flag}</span>
                    <span className="flex-1 truncate text-xs font-medium text-foreground">{name}</span>
                    <button
                      onClick={() => togglePin(id)}
                      title={isPinned ? 'Unpin' : 'Pin to top'}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-lg border transition',
                        isPinned
                          ? 'border-primary/40 bg-primary/10 text-primary'
                          : 'border-border/60 text-muted-foreground hover:text-primary hover:border-primary/40'
                      )}
                    >
                      {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </button>
                    <button
                      onClick={() => toggleHide(id)}
                      title={isHidden ? 'Show in feed' : 'Hide from feed'}
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-lg border transition',
                        isHidden
                          ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-600'
                          : 'border-border/60 text-muted-foreground hover:text-destructive hover:border-destructive/40'
                      )}
                    >
                      {isHidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                    </button>
                  </div>
                );
              })}
              {(pinnedIds.size > 0 || hiddenIds.size > 0) && (
                <button
                  onClick={() => { setPinnedIds(new Set()); setHiddenIds(new Set()); }}
                  className="mt-1 w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition"
                >
                  Reset all
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feed items */}
      <div className="max-h-[280px] overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
        <AnimatePresence initial={false}>
          {shown.map((item) => {
            const cfg = TYPE_CONFIG[item.type];
            const Icon = cfg.icon;
            const isPinned = pinnedIds.has(item.studentId);

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18 }}
                className={cn('flex gap-3', isPinned && 'rounded-xl bg-primary/5 px-2 py-1 -mx-2')}
              >
                {isPinned && (
                  <Pin className="mt-1 h-3 w-3 shrink-0 text-primary/50" />
                )}
                <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}>
                  <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <Link
                      href={`/counsellor/students/${item.studentId}`}
                      className="truncate text-xs font-semibold text-foreground hover:text-primary"
                    >
                      {item.studentFlag} {item.studentName}
                    </Link>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{formatRelative(item.date)}</span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{item.content}</p>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {extra > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          +{extra} more {hiddenIds.size > 0 ? `· ${hiddenIds.size} hidden` : ''}
        </p>
      )}

      {shown.length === 0 && (
        <div className="py-6 text-center text-xs text-muted-foreground">
          No activity to show — unhide students to see their updates.
        </div>
      )}
    </div>
  );
};
