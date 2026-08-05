'use client';

// Left rail for the Assistant: searchable conversation list (pinned first, as
// they arrive from listConversations) with per-row pin / rename / delete, plus
// a collapsible "Sent actions" log at the bottom (every mode — counsellors now
// propose agentic tool_actions too). List-card styling follows the counsellor
// inbox idiom; the two-click delete follows the widget's clear idiom.

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUpRight,
  ChevronDown,
  MessageSquare,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils/dates';
import { isChatAction } from '@/lib/chat/actions';
import type { ChatMode } from '@/lib/chat/prompts';
import type { ChatConversationRow, ChatMessageRow } from '@/lib/types/demo-tables';

interface ConversationRailProps {
  conversations: ChatConversationRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  actionHistory: ChatMessageRow[];
  mode: ChatMode;
  busy: boolean;
}

export function ConversationRail({
  conversations,
  selectedId,
  onSelect,
  onNew,
  onRename,
  onDelete,
  onTogglePin,
  actionHistory,
  busy,
}: ConversationRailProps) {
  const [query, setQuery] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const confirmTimerRef = useRef<number | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? conversations.filter((c) => (c.title ?? 'New conversation').toLowerCase().includes(q))
    : conversations;

  const startRename = (conv: ChatConversationRow) => {
    setRenamingId(conv.id);
    setRenameText(conv.title ?? '');
  };

  const commitRename = () => {
    if (!renamingId) return;
    const next = renameText.trim();
    if (next) onRename(renamingId, next);
    setRenamingId(null);
    setRenameText('');
  };

  const handleDeleteClick = (id: string) => {
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    if (confirmDeleteId === id) {
      onDelete(id);
      setConfirmDeleteId(null);
      return;
    }
    setConfirmDeleteId(id);
    confirmTimerRef.current = window.setTimeout(() => setConfirmDeleteId(null), 3000);
  };

  // Shown for every mode now that counsellors also propose (agentic tool_action)
  // — the section is empty-hidden purely by whether any actions exist.
  const showActionHistory = actionHistory.length > 0;

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col overflow-hidden rounded-3xl border border-border bg-card">
      {/* New chat + search */}
      <div className="space-y-2 border-b border-border p-3">
        <button
          type="button"
          onClick={onNew}
          disabled={busy}
          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-[transform,opacity] hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </button>
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <label htmlFor="assistant-rail-search" className="sr-only">
            Search conversations
          </label>
          <input
            id="assistant-rail-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-3 text-xs transition-[border-color,box-shadow] hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto overscroll-contain p-2">
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {q ? 'No conversations match.' : 'No conversations yet.'}
          </p>
        ) : (
          <ul className="space-y-1">
            <AnimatePresence initial={false}>
              {visible.map((conv) => {
                const isActive = conv.id === selectedId;
                const isRenaming = renamingId === conv.id;
                const isConfirmingDelete = confirmDeleteId === conv.id;
                return (
                  <motion.li
                    key={conv.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.16 }}
                    className={cn(
                      'group relative rounded-xl border px-2.5 py-2 transition',
                      isActive ? 'border-primary/30 bg-primary/10' : 'border-transparent hover:bg-muted'
                    )}
                  >
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitRename();
                          } else if (e.key === 'Escape') {
                            setRenamingId(null);
                          }
                        }}
                        aria-label="Conversation title"
                        className="w-full rounded-lg border border-primary/30 bg-background px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelect(conv.id)}
                        className="flex w-full items-start gap-2 text-left"
                      >
                        {conv.pinned ? (
                          <Pin className="mt-0.5 h-3 w-3 shrink-0 fill-current text-primary-ink" aria-hidden />
                        ) : (
                          <MessageSquare
                            className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
                            aria-hidden
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block truncate text-xs',
                              isActive ? 'font-semibold text-foreground' : 'font-medium text-foreground'
                            )}
                          >
                            {conv.title?.trim() || 'New conversation'}
                          </span>
                          <span className="block text-label text-muted-foreground">
                            {formatRelativeTime(conv.last_message_at)}
                          </span>
                        </span>
                      </button>
                    )}

                    {/* Hover actions */}
                    {!isRenaming && (
                      <div
                        className={cn(
                          'absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-full bg-card/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100 focus-within:opacity-100',
                          isConfirmingDelete && 'opacity-100'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => onTogglePin(conv.id, !conv.pinned)}
                          aria-label={conv.pinned ? 'Unpin conversation' : 'Pin conversation'}
                          title={conv.pinned ? 'Unpin' : 'Pin'}
                          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          {conv.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => startRename(conv)}
                          aria-label="Rename conversation"
                          title="Rename"
                          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(conv.id)}
                          aria-label={isConfirmingDelete ? 'Confirm delete conversation' : 'Delete conversation'}
                          title={isConfirmingDelete ? 'Confirm delete' : 'Delete'}
                          className={cn(
                            'flex h-6 items-center justify-center gap-1 rounded-full transition-colors',
                            isConfirmingDelete
                              ? 'w-auto px-2 text-label font-semibold text-danger'
                              : 'w-6 text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          <Trash2 className="h-3 w-3" />
                          {isConfirmingDelete ? <span>Delete?</span> : null}
                        </button>
                      </div>
                    )}
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Sent actions log */}
      {showActionHistory && (
        <div className="border-t border-border">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="flex w-full items-center justify-between px-3 py-2.5 text-label font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            Sent actions
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', historyOpen && 'rotate-180')}
              aria-hidden
            />
          </button>
          <AnimatePresence initial={false}>
            {historyOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <ul className="max-h-48 space-y-1 overflow-y-auto px-2 pb-2">
                  {actionHistory.map((row) => (
                    <ActionHistoryItem key={row.id} row={row} />
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ─── Sent action row ──────────────────────────────────────────────────────────

function ActionHistoryItem({ row }: { row: ChatMessageRow }) {
  const action = isChatAction(row.action) ? row.action : null;
  if (!action) return null;

  // Legacy variants deep-link to where the send landed; tool_action has no
  // single destination, so it renders as a plain (non-navigational) row.
  let href: string | null = null;
  let label: string;
  let secondary: string;

  if (action.kind === 'help_request') {
    const sentId =
      row.action && typeof (row.action as { sentHelpRequestId?: unknown }).sentHelpRequestId === 'string'
        ? (row.action as { sentHelpRequestId: string }).sentHelpRequestId
        : '';
    href = sentId ? `/inbox?help=${sentId}` : '/inbox';
    label = action.subject || action.body;
    secondary = formatRelativeTime(row.created_at);
  } else if (action.kind === 'counsellor_message') {
    href = '/parent/messages';
    label = action.body;
    secondary = formatRelativeTime(row.created_at);
  } else {
    label = action.title;
    secondary = action.resultMessage || action.summary || formatRelativeTime(row.created_at);
  }

  const inner = (
    <>
      <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0 text-primary-ink" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label font-medium text-foreground">{label}</span>
        <span className="block truncate text-label text-muted-foreground">{secondary}</span>
      </span>
    </>
  );

  return (
    <li>
      {href ? (
        <Link
          href={href}
          className="flex items-start gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex items-start gap-2 rounded-xl px-2 py-1.5">{inner}</div>
      )}
    </li>
  );
}
