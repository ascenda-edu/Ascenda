'use client';

// The full-page Assistant — the DEEP-WORK surface (the floating widget is the
// quick-answer one). DB-backed conversation history in the rail, live streaming
// via useChatStream, programme search results and confirm-card actions inline.
// Mounted by the three portal pages (/assistant, /counsellor/assistant,
// /parent/assistant) with the portal's mode + the signed-in user's id.
//
// useSearchParams needs a Suspense boundary, so the exported component is a thin
// wrapper around the inner workspace (mirrors the SectionNav pattern).

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { PanelLeft, Plus, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSupabase } from '@/hooks/useSupabase';
import { useChatStream } from '@/hooks/use-chat-stream';
import { useRealtimePoll } from '@/hooks/use-realtime-poll';
import {
  createConversation,
  deleteConversation,
  listActionHistory,
  listConversations,
  listMessages,
  renameConversation,
  setMessageRating,
  togglePin,
  updateMessageAction,
} from '@/lib/chat/history';
import { insertHelpRequest } from '@/lib/demo/help-request-client';
import { isChatAction, type ChatAction } from '@/lib/chat/actions';
import type { ChatMode } from '@/lib/chat/prompts';
import type { ProgramHit } from '@/lib/chat/tools';
import type { ChatConversationRow, ChatMessageRow } from '@/lib/types/demo-tables';
import { ConversationRail } from './conversation-rail';
import { ThreadPane, type AssistantMessage } from './thread-pane';

// ─── Copy ─────────────────────────────────────────────────────────────────────

const SUBTITLES: Record<ChatMode, string> = {
  student: 'Your agentic workspace — search programmes, plan applications, contact your counsellor.',
  counsellor: 'Your agentic workspace — cohort insight and programme search.',
  parent: 'Your agentic workspace — follow your child’s journey and message the counsellor.',
};

const STATIC_CHIPS: Record<ChatMode, string[]> = {
  student: [
    'Find computer science programmes in the UK',
    'What should I do first?',
    'Help me message my counsellor',
    'When is my next deadline?',
  ],
  counsellor: [
    'Search programmes for a student',
    'How do I spot at-risk students?',
    'Show me cohort analytics',
    'What can I do from this section?',
  ],
  parent: [
    'How is my child doing overall?',
    'What does reach/match/safety mean?',
    'Message the counsellor for me',
    'Where do I see upcoming deadlines?',
  ],
};

// ─── Row → UI message ───────────────────────────────────────────────────────

function mapRow(row: ChatMessageRow): AssistantMessage {
  const action = isChatAction(row.action) ? row.action : undefined;
  const hits =
    row.tool_results && row.tool_results.length > 0
      ? (row.tool_results as unknown as ProgramHit[])
      : undefined;
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    action,
    actionState: row.action_state ?? undefined,
    rating: row.rating ?? undefined,
    hits,
    persisted: true,
  };
}

// ─── Inner workspace ──────────────────────────────────────────────────────────

function AssistantWorkspaceInner({ mode, userId }: { mode: ChatMode; userId: string }) {
  const supabase = useSupabase();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { run, runActionExecute, stop, isStreaming, cooldownRemaining, coolingDown } = useChatStream();

  const [conversations, setConversations] = useState<ChatConversationRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('c'));
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [actionHistory, setActionHistory] = useState<ChatMessageRow[]>([]);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<string[] | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null) as React.RefObject<HTMLTextAreaElement>;
  const messagesRef = useRef<AssistantMessage[]>([]);
  const didInit = useRef(false);
  messagesRef.current = messages;

  // ── Data loaders ──────────────────────────────────────────────────────────
  const refreshConversations = useCallback(async () => {
    if (!userId) return;
    try {
      setConversations(await listConversations(supabase, userId, mode));
    } catch (err) {
      console.warn('[assistant] load conversations failed:', err);
    }
  }, [supabase, userId, mode]);

  const refreshActionHistory = useCallback(async () => {
    if (!userId) return;
    try {
      setActionHistory(await listActionHistory(supabase, userId, mode));
    } catch (err) {
      console.warn('[assistant] load action history failed:', err);
    }
  }, [supabase, userId, mode]);

  const loadMessagesFor = useCallback(
    async (id: string) => {
      try {
        const rows = await listMessages(supabase, id);
        setMessages(rows.map(mapRow));
      } catch (err) {
        console.warn('[assistant] load messages failed:', err);
        setMessages([]);
      }
    },
    [supabase]
  );

  const updateUrl = useCallback(
    (id: string) => {
      router.replace(`${pathname}?c=${id}`, { scroll: false });
    },
    [router, pathname]
  );

  // First mount: load rail + action history, and hydrate the seeded ?c= thread.
  useEffect(() => {
    if (!userId || didInit.current) return;
    didInit.current = true;
    void (async () => {
      await Promise.all([refreshConversations(), refreshActionHistory()]);
      const seeded = searchParams.get('c');
      if (seeded) await loadMessagesFor(seeded);
    })();
  }, [userId, refreshConversations, refreshActionHistory, loadMessagesFor, searchParams]);

  // Live rail refresh (realtime + poll fallback).
  useRealtimePoll({
    channelName: `chat_conversations_${mode}`,
    subscriptions: [
      {
        table: 'chat_conversations',
        filter: `owner_id=eq.${userId}`,
        handler: () => void refreshConversations(),
      },
    ],
    onPoll: () => void refreshConversations(),
    enabled: Boolean(userId),
  });

  // Starter chips for a first, empty visit.
  useEffect(() => {
    if (!userId || selectedId || conversations.length > 0 || suggestions !== null) return;
    let stale = false;
    fetch(`/api/chat/suggestions?mode=${mode}`)
      .then((res) => (res.ok ? res.json() : { suggestions: [] }))
      .then((data: { suggestions?: string[] }) => {
        if (!stale) setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      })
      .catch(() => {
        if (!stale) setSuggestions([]);
      });
    return () => {
      stale = true;
    };
  }, [userId, selectedId, conversations.length, suggestions, mode]);

  // ── Conversation selection ─────────────────────────────────────────────────
  const selectConversation = useCallback(
    async (id: string) => {
      setRailOpen(false);
      if (id === selectedId) return;
      if (isStreaming) stop();
      setSelectedId(id);
      updateUrl(id);
      await loadMessagesFor(id);
      inputRef.current?.focus();
    },
    [selectedId, isStreaming, stop, updateUrl, loadMessagesFor, inputRef]
  );

  // New chat only resets local state — the conversation row is created on the
  // first send (sendMessage's auto-create), so repeated clicks never litter
  // the rail with empty conversations.
  const handleNewChat = useCallback(() => {
    if (isStreaming) stop();
    setMessages([]);
    setSelectedId(null);
    router.replace(pathname, { scroll: false });
    setRailOpen(false);
    inputRef.current?.focus();
  }, [isStreaming, stop, router, pathname, inputRef]);

  // ── Streaming ───────────────────────────────────────────────────────────────
  const runAssistant = useCallback(
    async (history: AssistantMessage[], conversationId: string) => {
      const assistantId = `a-${Date.now()}`;
      setMessages([...history, { id: assistantId, role: 'assistant', content: '' }]);

      const patch = (p: Partial<AssistantMessage>) =>
        setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, ...p } : m)));

      const result = await run({
        history: history.map((m) => ({ role: m.role, content: m.content })),
        mode,
        surface: 'assistant',
        conversationId,
        currentPage: pathname,
        handlers: {
          onTextDelta: (fullText) => {
            setStatusLabel(null);
            patch({ content: fullText });
          },
          onStatus: (_tool, label) => setStatusLabel(label),
          onAction: (action) =>
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      action,
                      actionState: 'pending',
                      content:
                        m.content.trim().length === 0
                          ? "I've put a draft together — review and send it below."
                          : m.content,
                    }
                  : m
              )
            ),
          onResults: (batch) =>
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId ? { ...m, hits: [...(m.hits ?? []), ...batch] } : m
              )
            ),
        },
      });
      setStatusLabel(null);

      if (result.kind === 'aborted') {
        if (!result.text) setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        return;
      }
      if (result.kind === 'empty') {
        patch({ content: 'No reply came back — please try again.', error: true });
        return;
      }
      if (result.kind === 'rate_limited' || result.kind === 'error') {
        patch({ content: result.message, error: true });
        return;
      }
      // Completed: adopt the persisted row id so follow-up writes (action
      // sent-state, ratings) land on the real DB row instead of silently
      // no-oping against the temp id.
      if (result.savedId) {
        patch({ id: result.savedId, persisted: true });
      }
      // Server updated title/last_message_at — refresh the rail.
      await refreshConversations();
    },
    [run, mode, pathname, refreshConversations]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const text = content.trim();
      if (!text || isStreaming || coolingDown) return;

      // Auto-create a conversation on the first send of a fresh workspace.
      let conversationId = selectedId;
      if (!conversationId) {
        if (busy) return;
        setBusy(true);
        try {
          const { id } = await createConversation(supabase, { ownerId: userId, mode, title: null });
          conversationId = id;
          setSelectedId(id);
          updateUrl(id);
          await refreshConversations();
        } catch (err) {
          console.warn('[assistant] auto-create conversation failed:', err);
          setBusy(false);
          return;
        }
        setBusy(false);
      }

      const userMessage: AssistantMessage = { id: `u-${Date.now()}`, role: 'user', content: text };
      const history = [...messagesRef.current, userMessage];
      setMessages(history);
      setInput('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
      await runAssistant(history, conversationId);
    },
    [
      isStreaming,
      coolingDown,
      selectedId,
      busy,
      supabase,
      userId,
      mode,
      updateUrl,
      refreshConversations,
      runAssistant,
      inputRef,
    ]
  );

  // Re-run the last user message (error retry + trailing-user resend share this).
  const resendLast = useCallback(async () => {
    if (isStreaming || !selectedId) return;
    const current = messagesRef.current;
    const lastUserIdx = current.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx === -1) return;
    const history = current.slice(0, lastUserIdx + 1);
    setMessages(history);
    await runAssistant(history, selectedId);
  }, [isStreaming, selectedId, runAssistant]);

  // ── Ratings ─────────────────────────────────────────────────────────────────
  const handleRate = useCallback(
    (messageId: string, rating: 1 | -1) => {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, rating } : m)));
      const msg = messagesRef.current.find((m) => m.id === messageId);
      if (msg?.persisted) void setMessageRating(supabase, messageId, rating).catch(() => {});
    },
    [supabase]
  );

  // ── Actions (send / cancel) ───────────────────────────────────────────────
  const revertAction = useCallback(
    (messageId: string) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, actionState: 'pending' } : m))
      ),
    []
  );

  // tool_action: run the WriteTool server-side (POST /api/chat/actions/execute),
  // then stream the assistant's follow-up turn into a NEW bubble. Mirrors
  // runAssistant's optimistic-append + patch pattern. Requires a persisted DB id
  // (the card is disabled until then), so the endpoint can claim the row.
  const runToolAction = useCallback(
    async (messageId: string, edited: Extract<ChatAction, { kind: 'tool_action' }>): Promise<boolean> => {
      if (!selectedId) return false;

      const followId = `a-${Date.now()}`;
      let executedOk = false;
      let bubbleCreated = false;

      const ensureBubble = () =>
        setMessages((prev) => {
          if (bubbleCreated) return prev;
          bubbleCreated = true;
          return [...prev, { id: followId, role: 'assistant', content: '' }];
        });
      const patchBubble = (p: Partial<AssistantMessage>) =>
        setMessages((prev) => prev.map((m) => (m.id === followId ? { ...m, ...p } : m)));

      const result = await runActionExecute(
        { conversationId: selectedId, messageId, tool: edited.tool, params: edited.params },
        {
          onStatus: (_tool, label) => setStatusLabel(label),
          onExecuted: (ex) => {
            if (!ex.ok) return; // failure is handled off the terminal result below
            executedOk = true;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === messageId
                  ? {
                      ...m,
                      actionState: 'sent',
                      action: {
                        ...edited,
                        resultMessage: ex.message,
                        ...(ex.result !== undefined
                          ? { result: ex.result as Record<string, unknown> }
                          : {}),
                      },
                    }
                  : m
              )
            );
            ensureBubble();
          },
          onTextDelta: (fullText) => {
            setStatusLabel(null);
            ensureBubble();
            patchBubble({ content: fullText });
          },
          onAction: (next) => {
            ensureBubble();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === followId
                  ? {
                      ...m,
                      action: next,
                      actionState: 'pending',
                      content:
                        m.content.trim().length === 0
                          ? "I've put a draft together — review and send it below."
                          : m.content,
                    }
                  : m
              )
            );
          },
          onResults: (batch) => {
            ensureBubble();
            setMessages((prev) =>
              prev.map((m) =>
                m.id === followId ? { ...m, hits: [...(m.hits ?? []), ...batch] } : m
              )
            );
          },
        }
      );
      setStatusLabel(null);

      const dropEmptyBubble = () =>
        setMessages((prev) => prev.filter((m) => !(m.id === followId && !m.content)));

      // Someone else (another tab / a double-click) already claimed the row.
      if (result.kind === 'conflict') {
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, actionState: 'sent' } : m))
        );
        void refreshActionHistory();
        void refreshConversations();
        return true;
      }
      // Invalid params — card stays editable and shows its failed hint.
      if (result.kind === 'invalid') {
        revertAction(messageId);
        return false;
      }
      if (result.kind === 'error' || result.kind === 'rate_limited') {
        if (!executedOk) revertAction(messageId);
        if (bubbleCreated) patchBubble({ content: result.message, error: true });
        return executedOk;
      }
      if (result.kind === 'aborted') {
        if (!executedOk) revertAction(messageId);
        if (!result.text) dropEmptyBubble();
        return executedOk;
      }
      if (result.kind === 'empty') {
        if (!executedOk) {
          revertAction(messageId);
          dropEmptyBubble();
          return false;
        }
        dropEmptyBubble();
        void refreshActionHistory();
        void refreshConversations();
        return true;
      }
      // completed
      if (!executedOk) {
        // executed.ok === false (or never arrived) — the run itself failed.
        revertAction(messageId);
        dropEmptyBubble();
        return false;
      }
      if (result.savedId) patchBubble({ id: result.savedId, persisted: true });
      void refreshActionHistory();
      await refreshConversations();
      return true;
    },
    [selectedId, runActionExecute, refreshActionHistory, refreshConversations, revertAction]
  );

  const handleActionSend = useCallback(
    async (messageId: string, edited: ChatAction): Promise<boolean> => {
      const persisted = messagesRef.current.find((m) => m.id === messageId)?.persisted ?? false;
      // Optimistic client-only 'sending' — never written to the DB (the check
      // constraint only allows pending/sent/cancelled).
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, actionState: 'sending' } : m)));

      // Agentic path: needs a real DB row id (the card's Confirm is disabled
      // until persisted, but guard anyway).
      if (edited.kind === 'tool_action') {
        if (!persisted) {
          revertAction(messageId);
          return false;
        }
        return runToolAction(messageId, edited);
      }

      // Legacy client-side sends — byte-identical to before.
      try {
        if (edited.kind === 'help_request') {
          const { id } = await insertHelpRequest(supabase, {
            student_profile_id: userId,
            subject: edited.subject,
            body: edited.body,
            ...(edited.applicationId ? { application_id: edited.applicationId } : {}),
          });
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, action: edited, actionState: 'sent' } : m))
          );
          if (persisted) {
            await updateMessageAction(supabase, messageId, 'sent', { ...edited, sentHelpRequestId: id });
          }
        } else {
          const res = await fetch('/api/parent/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contactId: edited.contactId, body: edited.body }),
          });
          if (!res.ok) throw new Error('parent message send failed');
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, action: edited, actionState: 'sent' } : m))
          );
          if (persisted) await updateMessageAction(supabase, messageId, 'sent', { ...edited });
        }
        void refreshActionHistory();
        return true;
      } catch (err) {
        console.warn('[assistant] action send failed:', err);
        // Revert to pending — the confirm card surfaces its own error.
        revertAction(messageId);
        return false;
      }
    },
    [supabase, userId, refreshActionHistory, revertAction, runToolAction]
  );

  const handleActionCancel = useCallback(
    (messageId: string) => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, actionState: 'cancelled' } : m))
      );
      const persisted = messagesRef.current.find((m) => m.id === messageId)?.persisted ?? false;
      if (persisted) void updateMessageAction(supabase, messageId, 'cancelled').catch(() => {});
    },
    [supabase]
  );

  // ── Rail CRUD ─────────────────────────────────────────────────────────────
  const handleRename = useCallback(
    (id: string, title: string) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
      void renameConversation(supabase, id, title)
        .then(() => refreshConversations())
        .catch((err) => console.warn('[assistant] rename failed:', err));
    },
    [supabase, refreshConversations]
  );

  const handleDelete = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (id === selectedId) {
        setSelectedId(null);
        setMessages([]);
        router.replace(pathname, { scroll: false });
      }
      void deleteConversation(supabase, id)
        .then(() => refreshConversations())
        .catch((err) => console.warn('[assistant] delete failed:', err));
    },
    [supabase, selectedId, router, pathname, refreshConversations]
  );

  const handleTogglePin = useCallback(
    (id: string, pinned: boolean) => {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned } : c)));
      void togglePin(supabase, id, pinned)
        .then(() => refreshConversations())
        .catch((err) => console.warn('[assistant] pin failed:', err));
    },
    [supabase, refreshConversations]
  );

  // ── Derived ──────────────────────────────────────────────────────────────
  const activeConv = conversations.find((c) => c.id === selectedId);
  const threadTitle = activeConv?.title?.trim() || (selectedId ? 'New conversation' : 'New chat');
  const chips = suggestions && suggestions.length > 0 ? suggestions : STATIC_CHIPS[mode];

  const starterPanel = (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <h2 className="font-heading text-lg font-semibold text-foreground">Start a conversation</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{SUBTITLES[mode]}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => void sendMessage(chip)}
            disabled={coolingDown}
            className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground transition-[transform,border-color,color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:text-foreground hover:shadow-sm disabled:opacity-50"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );

  const rail = (
    <ConversationRail
      conversations={conversations}
      selectedId={selectedId}
      onSelect={(id) => void selectConversation(id)}
      onNew={() => void handleNewChat()}
      onRename={handleRename}
      onDelete={handleDelete}
      onTogglePin={handleTogglePin}
      actionHistory={actionHistory}
      mode={mode}
      busy={busy}
    />
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label="Show conversations"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Ascendi</p>
            <h1 className="font-heading text-2xl font-semibold text-foreground">Assistant</h1>
            <p className="mt-0.5 max-w-xl text-sm text-muted-foreground">{SUBTITLES[mode]}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleNewChat()}
          disabled={busy}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-[transform,opacity] hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <Plus className="h-3.5 w-3.5" />
          New chat
        </button>
      </div>

      {/* Workspace grid */}
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <div className="hidden lg:block">{rail}</div>
        <ThreadPane
          title={threadTitle}
          messages={messages}
          mode={mode}
          isStreaming={isStreaming}
          emptyState={starterPanel}
          onRetry={() => void resendLast()}
          onResend={() => void resendLast()}
          onRate={handleRate}
          onActionSend={handleActionSend}
          onActionCancel={handleActionCancel}
          statusLabel={statusLabel}
          input={input}
          onInputChange={setInput}
          onSubmit={() => void sendMessage(input)}
          onStop={stop}
          coolingDown={coolingDown}
          cooldownRemaining={cooldownRemaining}
          inputRef={inputRef}
        />
      </div>

      {/* Mobile rail slide-over */}
      <AnimatePresence>
        {railOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <div
              className="absolute inset-0 bg-background/60 backdrop-blur-sm"
              onClick={() => setRailOpen(false)}
              aria-hidden
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="absolute inset-y-0 left-0 flex w-[300px] max-w-[85vw] flex-col p-3"
            >
              <div className="mb-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setRailOpen(false)}
                  aria-label="Close conversations"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1">{rail}</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Suspense wrapper ─────────────────────────────────────────────────────────

export function AssistantWorkspace({ mode, userId }: { mode: ChatMode; userId: string }) {
  return (
    <Suspense fallback={null}>
      <AssistantWorkspaceInner mode={mode} userId={userId} />
    </Suspense>
  );
}
