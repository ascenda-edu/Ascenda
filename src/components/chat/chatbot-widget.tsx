'use client';

// Ascendi floating widget — the QUICK-ANSWER surface. Context-aware and
// read-only: READ tools run server-side (programme search, matches,
// applications, university lookups) and their results render as the same rich
// cards as the Assistant — but there are NO actions on this surface (the
// server refuses write calls for surface 'widget'); those live in the
// full-page Assistant, and the header offers a handoff that carries the
// conversation (cards included) there. Streaming/cooldown behaviour comes
// from useChatStream; shared render primitives from ./shared.

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, X, Send, Loader2, Trash2, ArrowRight, RotateCcw, ArrowUpRight,
  LayoutDashboard, Search, Zap, Briefcase, Heart, User,
  Wrench, PenTool, BarChart3, ClipboardCheck, CalendarClock,
  Gift, BarChart2, Users, FileText, TrendingUp, Wallet, MessageCircle,
  Square, ThumbsUp, ThumbsDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DURATION, EASE, EASE_POP } from '@/lib/motion';
import { useSupabase } from '@/hooks/useSupabase';
import { useChatStream } from '@/hooks/use-chat-stream';
import { createConversation, appendMessages } from '@/lib/chat/history';
import { isChatWidget, mergeWidgets, type ChatWidget } from '@/lib/chat/widgets';
import { WidgetRenderer } from '@/components/assistant/widgets';
import type { ChatMode } from '@/lib/chat/prompts';
import type { ChatMessageInsert } from '@/lib/types/demo-tables';
import {
  MessageContent,
  AutoResizeTextarea,
  assistantPathForMode,
  isAssistantRoute,
  detectMode,
  prefersReducedMotion,
} from './shared';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** True when this assistant bubble holds a stream/fetch error, not a reply. */
  error?: boolean;
  /** Thumbs feedback the user gave on this answer. */
  rating?: 1 | -1;
  /** Rich widget groups from read tools (see lib/chat/widgets). */
  widgets?: ChatWidget[];
  // Legacy fields from the pre-split widget (actions now live in the
  // Assistant). Kept so old localStorage histories still parse; not rendered.
  action?: unknown;
  actionState?: string;
}

// ─── Page snippets for preview cards ────────────────────────────────────────

interface PageSnippet {
  route: string;
  name: string;
  description: string;
  icon: React.ElementType;
}

const STUDENT_SNIPPETS: PageSnippet[] = [
  { route: '/dashboard', name: 'Dashboard', description: 'Your mission control — track priorities, deadlines, and match recommendations.', icon: LayoutDashboard },
  { route: '/university-search', name: 'University Search', description: 'Browse and explore universities and programs worldwide with smart filters.', icon: Search },
  { route: '/matches', name: 'Matches', description: 'AI-powered university matches ranked by compatibility with your profile.', icon: Zap },
  { route: '/applications', name: 'Applications', description: 'Track all your applications, deadlines, documents, and checklists.', icon: Briefcase },
  { route: '/shortlist', name: 'Shortlist', description: 'Save and compare universities before committing to applications.', icon: Heart },
  { route: '/profile', name: 'Profile', description: 'Your academic and personal profile — grades, scores, and preferences.', icon: User },
  { route: '/toolbox', name: 'Toolbox', description: 'Powerful tools: essay workshop, chances calculator, requirements, and timeline.', icon: Wrench },
  { route: '/toolbox/essay-workshop', name: 'Essay Workshop', description: 'Write and refine personal statements with AI coaching and building blocks.', icon: PenTool },
  { route: '/toolbox/chances', name: 'Chances Calculator', description: 'Estimate your admission chances at specific universities.', icon: BarChart3 },
  { route: '/toolbox/requirements', name: 'Requirements Checker', description: 'See what each university needs — grades, tests, and documents.', icon: ClipboardCheck },
  { route: '/toolbox/timeline', name: 'Timeline Planner', description: 'Visual timeline of all your deadlines and milestones.', icon: CalendarClock },
  { route: '/scholarships', name: 'Scholarships', description: 'Explore scholarship opportunities matched to your profile.', icon: Gift },
];

const COUNSELLOR_SNIPPETS: PageSnippet[] = [
  { route: '/counsellor', name: 'Overview', description: 'Customisable widget dashboard — cohort health at a glance.', icon: LayoutDashboard },
  { route: '/counsellor/students', name: 'Student Roster', description: 'Search, filter, and manage all your students in one place.', icon: Users },
  { route: '/counsellor/analytics', name: 'Analytics', description: 'Cohort charts — application trends, acceptance rates, and grade distributions.', icon: BarChart2 },
  { route: '/counsellor/deadlines', name: 'Deadlines', description: 'Cross-cohort deadline monitor — spot students falling behind.', icon: CalendarClock },
  { route: '/counsellor/documents', name: 'Documents', description: 'Track references, transcripts, and predicted grade submissions.', icon: FileText },
  { route: '/counsellor/outcomes', name: 'Outcomes', description: 'Analyse offer and rejection results across the cohort.', icon: TrendingUp },
  { route: '/counsellor/applications', name: 'Applications', description: 'Overview of all student applications by status and deadline.', icon: Briefcase },
];

const PARENT_SNIPPETS: PageSnippet[] = [
  { route: '/parent', name: 'Overview', description: 'How your child is doing at a glance — progress, deadlines, and highlights.', icon: LayoutDashboard },
  { route: '/parent/progress', name: 'Progress', description: "Each application's stage, fit, and remaining work — read-only.", icon: TrendingUp },
  { route: '/parent/deadlines', name: 'Deadlines', description: 'Every application deadline, grouped by urgency.', icon: CalendarClock },
  { route: '/parent/finances', name: 'Costs & value', description: 'Tuition, living costs, and graduate outcomes for every programme in play.', icon: Wallet },
  { route: '/parent/messages', name: 'Messages', description: "A direct line to the counsellor guiding your child's applications.", icon: MessageCircle },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function storageKey(mode: ChatMode) {
  return `ascendi-chat-${mode}`;
}

function loadMessages(mode: ChatMode): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(mode));
    const parsed: Message[] = raw ? JSON.parse(raw) : [];
    // localStorage is user-owned but still untrusted shape — drop widget
    // groups that don't pass the guard rather than feeding them a renderer.
    return parsed.map((m) =>
      Array.isArray(m.widgets)
        ? { ...m, widgets: (m.widgets as unknown[]).filter(isChatWidget) as ChatWidget[] }
        : m
    );
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[], mode: ChatMode) {
  try {
    localStorage.setItem(storageKey(mode), JSON.stringify(messages));
  } catch { /* quota exceeded — ignore */ }
}

/** Extract route references like /dashboard, /toolbox/essay-workshop from text */
function extractRoutes(text: string): string[] {
  const matches = text.match(/\/[a-z][a-z0-9-/]*/gi) ?? [];
  return [...new Set(matches)];
}

/** Find page snippets that match routes mentioned in a message */
function getSnippetsForMessage(text: string, mode: ChatMode): PageSnippet[] {
  const snippets =
    mode === 'counsellor' ? COUNSELLOR_SNIPPETS : mode === 'parent' ? PARENT_SNIPPETS : STUDENT_SNIPPETS;
  const routes = extractRoutes(text);
  return snippets.filter((s) =>
    routes.some((r) => r === s.route || r.startsWith(s.route + '/'))
  );
}

const STUDENT_SUGGESTIONS = [
  'How do I improve my match score?',
  'Where can I track my applications?',
  'What should I do first?',
  'When is my next deadline?',
];

const COUNSELLOR_SUGGESTIONS = [
  'How do I spot at-risk students?',
  'Show me the analytics dashboard',
  'How do I track deadlines across students?',
  'What can I do from this section?',
];

const PARENT_SUGGESTIONS = [
  'How is my child doing overall?',
  'Where do I see upcoming deadlines?',
  'What does reach/match/safety mean?',
  'How do I contact the counsellor?',
];

// ─── Page snippet card ──────────────────────────────────────────────────────

function PageCard({ snippet, onClick }: { snippet: PageSnippet; onClick: () => void }) {
  const Icon = snippet.icon;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-background p-2.5 text-left transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-e-1"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary-ink" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">{snippet.name}</p>
        <p className="truncate text-label text-muted-foreground">{snippet.description}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

// ─── Main widget ────────────────────────────────────────────────────────────

export function ChatbotWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useSupabase();
  const mode = detectMode(pathname);
  const { run, stop, isStreaming, cooldownRemaining, coolingDown } = useChatStream();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(mode));
  const [input, setInput] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[] | null>(null);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [handoffBusy, setHandoffBusy] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null) as React.RefObject<HTMLTextAreaElement>;
  const prevModeRef = useRef(mode);
  const confirmTimerRef = useRef<number | null>(null);

  // Switch chat history when mode changes (student <-> counsellor <-> parent)
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      setMessages(loadMessages(mode));
      setDynamicSuggestions(null);
      prevModeRef.current = mode;
    }
  }, [mode]);

  // Persist messages
  useEffect(() => {
    saveMessages(messages, mode);
  }, [messages, mode]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Personalised starter chips for the empty state. Also pre-warms the
  // server's context cache so the first real message answers faster.
  useEffect(() => {
    if (!isOpen || messages.length > 0 || dynamicSuggestions !== null) return;
    let stale = false;
    fetch(`/api/chat/suggestions?mode=${mode}`)
      .then((res) => (res.ok ? res.json() : { suggestions: [] }))
      .then((data: { suggestions?: string[] }) => {
        if (!stale) setDynamicSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      })
      .catch(() => {
        if (!stale) setDynamicSuggestions([]);
      });
    return () => {
      stale = true;
    };
  }, [isOpen, messages.length, dynamicSuggestions, mode]);

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(storageKey(mode));
    setConfirmClear(false);
  };

  // First click arms the confirm state; a second click within a few seconds
  // clears. Auto-resets so a stray click never wipes history outright.
  const handleClearClick = () => {
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    if (confirmClear) {
      clearChat();
      return;
    }
    setConfirmClear(true);
    confirmTimerRef.current = window.setTimeout(() => setConfirmClear(false), 3000);
  };

  const navigateTo = (route: string) => {
    router.push(route);
    setIsOpen(false);
  };

  // Stream an assistant reply for the given conversation. `history` must end
  // with the user message being answered; a fresh empty assistant bubble is
  // appended and filled as chunks arrive. On failure that bubble is marked as
  // an error row (rendered distinctly, with a Retry affordance). A user Stop
  // keeps whatever streamed so far as a normal bubble.
  const runAssistant = async (history: Message[]) => {
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
    };
    setMessages([...history, assistantMessage]);

    const setBubble = (patch: Partial<Message>) =>
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMessage.id ? { ...m, ...patch } : m))
      );

    const result = await run({
      history: history.map((m) => ({ role: m.role, content: m.content })),
      mode,
      surface: 'widget',
      currentPage: pathname,
      handlers: {
        onTextDelta: (fullText) => {
          setStatusLabel(null);
          setBubble({ content: fullText });
        },
        onStatus: (_tool, label) => setStatusLabel(label),
        onWidgets: (batch) =>
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMessage.id
                ? { ...m, widgets: mergeWidgets(m.widgets ?? [], batch) }
                : m
            )
          ),
      },
    });
    setStatusLabel(null);

    if (result.kind === 'aborted') {
      // User pressed Stop: keep the partial answer; drop an empty bubble.
      if (!result.text) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMessage.id));
      }
      return;
    }
    if (result.kind === 'empty') {
      setBubble({ content: 'No reply came back — please try again.', error: true });
      return;
    }
    if (result.kind === 'rate_limited' || result.kind === 'error') {
      setBubble({ content: result.message, error: true });
    }
  };

  const sendMessage = (content: string) => {
    if (!content.trim() || isStreaming || coolingDown) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
    };

    const history = [...messages, userMessage];
    setMessages(history);
    setInput('');
    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = 'auto';
    void runAssistant(history);
  };

  // Resend the last user message after an error — drop the failed assistant
  // bubble and re-run generation from the same history.
  const retryLast = () => {
    if (isStreaming) return;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx === -1) return;
    const history = messages.slice(0, lastUserIdx + 1);
    setMessages(history);
    void runAssistant(history);
  };

  const sendFeedback = (msg: Message, rating: 1 | -1) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, rating } : m)));
    void fetch('/api/chat/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, messageContent: msg.content, rating }),
    }).catch(() => {
      /* feedback is best-effort */
    });
  };

  // Carry the recent exchange into a new Assistant conversation and jump
  // there. Error bubbles and legacy action metadata are stripped — only clean
  // role+content rows travel. Widget history is left intact.
  const handoffToAssistant = async () => {
    if (handoffBusy) return;
    setHandoffBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const carried = messages
        .filter((m) => !m.error && m.content.trim().length > 0)
        .slice(-12);
      const firstUser = carried.find((m) => m.role === 'user');
      const { id } = await createConversation(supabase, {
        ownerId: user.id,
        mode,
        title: firstUser ? firstUser.content.trim().slice(0, 60) : null,
      });
      if (carried.length > 0) {
        const rows: ChatMessageInsert[] = carried.map((m) => ({
          conversation_id: id,
          role: m.role,
          content: m.content,
          // Cards travel too — the Assistant restores them from tool_results.
          ...(m.widgets && m.widgets.length > 0
            ? { tool_results: m.widgets as unknown as Record<string, unknown>[] }
            : {}),
        }));
        await appendMessages(supabase, rows);
      }
      setIsOpen(false);
      router.push(`${assistantPathForMode(mode)}?c=${id}`);
    } catch (err) {
      console.warn('[chat] handoff failed:', err);
      setHandoffBusy(false);
      return;
    }
    setHandoffBusy(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // The full-page Assistant replaces the widget on its own routes.
  if (isAssistantRoute(pathname)) return null;

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            // The button pops in with overshoot so it announces itself; on the way out
            // it just goes, and on EASE — EASE_POP would drive scale below 0.
            animate={{ scale: 1, opacity: 1, transition: { duration: DURATION.fast, ease: EASE_POP } }}
            exit={{ scale: 0, opacity: 0, transition: { duration: DURATION.exit, ease: EASE } }}
            onClick={() => setIsOpen(true)}
            className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom,8px)+72px)] z-docked flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-e-3 shadow-primary/25 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-e-4 hover:shadow-primary/30 active:translate-y-0 md:bottom-6 md:right-6 md:z-panel"
            aria-label="Open Ascendi AI assistant"
          >
            <Bot className="h-5 w-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.base, ease: EASE } }}
            exit={{ opacity: 0, y: 20, scale: 0.95, transition: { duration: DURATION.exit, ease: EASE } }}
            className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom,8px)+72px)] z-[55] flex h-[min(560px,calc(100vh-140px))] w-[min(400px,calc(100vw-40px))] flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-e-4 md:bottom-6 md:right-6 md:z-panel md:h-[min(560px,calc(100vh-40px))]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary-ink" />
                </div>
                <div>
                  <p className="font-heading text-sm font-semibold text-foreground">Ascendi</p>
                  <p className="text-label text-muted-foreground">
                    {mode === 'counsellor'
                      ? 'Counsellor assistant'
                      : mode === 'parent'
                        ? 'Parent assistant'
                        : 'Student assistant'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={handoffToAssistant}
                  disabled={handoffBusy}
                  className="flex h-8 items-center gap-1 rounded-full px-2.5 text-label font-semibold text-primary-ink transition-colors hover:bg-primary/10 disabled:opacity-50"
                  aria-label="Continue in Assistant"
                  title="Continue this conversation in the Assistant"
                >
                  {handoffBusy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  )}
                  Assistant
                </button>
                {messages.length > 0 && (
                  <button
                    onClick={handleClearClick}
                    className={cn(
                      'flex h-8 items-center justify-center gap-1 rounded-full transition-colors',
                      confirmClear
                        ? 'w-auto px-2.5 text-label font-semibold text-danger'
                        : 'w-8 text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                    aria-label={confirmClear ? 'Confirm clear chat' : 'Clear chat'}
                    title={confirmClear ? 'Confirm clear chat' : 'Clear chat'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {confirmClear ? <span>Clear?</span> : null}
                  </button>
                )}
                <button
                  onClick={() => setIsOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Messages area */}
            <div
              className="flex-1 overflow-y-auto overscroll-contain px-4 py-3 space-y-3"
              aria-live="polite"
            >
              {messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center">
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Bot className="h-6 w-6 text-primary-ink" />
                  </div>
                  <p className="font-heading text-sm font-semibold text-foreground">
                    Hey! I&apos;m Ascendi
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[260px]">
                    {mode === 'counsellor'
                      ? 'Quick answers about your cohort — deadlines, at-risk students, programmes. To take action (notes, messages), open the Assistant.'
                      : mode === 'parent'
                        ? "Quick questions about your child's journey. To message the counsellor, open the Assistant."
                        : 'Quick answers — search programmes, check your matches, deadlines, and tasks. To take action, open the Assistant.'}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {(dynamicSuggestions && dynamicSuggestions.length > 0
                      ? dynamicSuggestions
                      : mode === 'counsellor'
                        ? COUNSELLOR_SUGGESTIONS
                        : mode === 'parent'
                          ? PARENT_SUGGESTIONS
                          : STUDENT_SUGGESTIONS
                    ).map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="rounded-full border border-border bg-background px-3 py-1.5 text-label text-muted-foreground transition-[transform,border-color,color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:text-foreground hover:shadow-e-1"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg, idx) => {
                  const snippets = msg.role === 'assistant' && msg.content && !msg.error
                    ? getSnippetsForMessage(msg.content, mode)
                    : [];
                  const isStreamingThis =
                    isStreaming && msg.role === 'assistant' && idx === messages.length - 1;
                  const showFeedback =
                    msg.role === 'assistant' && Boolean(msg.content) && !msg.error && !isStreamingThis;

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: DURATION.fast, ease: EASE }}
                      className={cn(
                        'flex flex-col',
                        msg.role === 'user' ? 'items-end' : 'items-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[85%] break-words rounded-2xl px-3.5 py-2.5 text-body-sm leading-relaxed',
                          msg.error
                            ? 'border border-danger/25 bg-danger-subtle text-danger'
                            : msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted/60 text-foreground'
                        )}
                      >
                        {msg.error ? (
                          <div className="space-y-1.5">
                            <p>{msg.content}</p>
                            <button
                              onClick={retryLast}
                              disabled={isStreaming}
                              className="inline-flex items-center gap-1 rounded-full border border-danger/25 px-2.5 py-1 text-label font-semibold text-danger transition hover:bg-danger-subtle disabled:opacity-50"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Retry
                            </button>
                          </div>
                        ) : msg.content ? (
                          msg.role === 'assistant' ? (
                            <MessageContent content={msg.content} mode={mode} onLinkClick={() => setIsOpen(false)} />
                          ) : (
                            msg.content
                          )
                        ) : isStreamingThis ? (
                          <div className="flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {statusLabel || 'Thinking…'}
                            </span>
                          </div>
                        ) : (
                          // Empty bubble that's no longer streaming (e.g. stale
                          // persisted state) — never show an eternal spinner.
                          <span className="text-xs text-muted-foreground">
                            No reply — try asking again.
                          </span>
                        )}
                      </div>

                      {/* Rich tool widgets (same registry as the Assistant).
                          A click on any card link navigates — close the panel
                          so the page behind is visible; toggle buttons etc.
                          (none on this surface) would not match the anchor. */}
                      {msg.widgets && msg.widgets.length > 0 && (
                        <div
                          className="mt-1.5 flex w-full max-w-[85%] flex-col gap-1.5"
                          onClickCapture={(e) => {
                            if ((e.target as HTMLElement).closest('a')) setIsOpen(false);
                          }}
                        >
                          {msg.widgets.map((widget) => (
                            <WidgetRenderer key={widget.kind} widget={widget} mode={mode} />
                          ))}
                        </div>
                      )}

                      {/* Page preview snippets */}
                      {snippets.length > 0 && (
                        <div className="mt-1.5 w-full max-w-[85%] space-y-1.5">
                          {snippets.map((snippet) => (
                            <PageCard
                              key={snippet.route}
                              snippet={snippet}
                              onClick={() => navigateTo(snippet.route)}
                            />
                          ))}
                        </div>
                      )}

                      {/* Thumbs feedback */}
                      {showFeedback && (
                        <div className="mt-1 flex items-center gap-0.5">
                          <button
                            onClick={() => sendFeedback(msg, 1)}
                            aria-label="Good answer"
                            aria-pressed={msg.rating === 1}
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                              msg.rating === 1
                                ? 'text-success'
                                : 'text-muted-foreground/60 hover:bg-muted hover:text-foreground'
                            )}
                          >
                            <ThumbsUp className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => sendFeedback(msg, -1)}
                            aria-label="Bad answer"
                            aria-pressed={msg.rating === -1}
                            className={cn(
                              'flex h-6 w-6 items-center justify-center rounded-full transition-colors',
                              msg.rating === -1
                                ? 'text-danger'
                                : 'text-muted-foreground/60 hover:bg-muted hover:text-foreground'
                            )}
                          >
                            <ThumbsDown className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="border-t border-border bg-card px-3 py-2.5"
            >
              {coolingDown && (
                <p className="mb-1.5 text-center text-label text-muted-foreground" role="status">
                  Message limit reached — you can send again in {cooldownRemaining}s
                </p>
              )}
              <div className="flex items-end gap-2 rounded-2xl border border-border bg-background px-3 py-1.5 transition-[border-color,box-shadow] focus-within:border-primary focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
                <AutoResizeTextarea
                  value={input}
                  onChange={setInput}
                  onSubmit={() => sendMessage(input)}
                  disabled={isStreaming || coolingDown}
                  inputRef={inputRef}
                />
                {isStreaming ? (
                  <button
                    type="button"
                    onClick={stop}
                    // Own focus ring, not the wrapper's: the wrapper lights up on
                    // `focus-within`, which fires for ANY child, so tabbing here used
                    // to highlight the whole composer as though the textarea had
                    // focus. The button needs an indicator that identifies IT.
                    className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-[transform,box-shadow] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label="Stop generating"
                    title="Stop generating"
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() || coolingDown}
                    className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[transform,opacity,box-shadow] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:hover:translate-y-0"
                    aria-label="Send message"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
