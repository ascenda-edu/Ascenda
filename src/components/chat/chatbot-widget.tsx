'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot, X, Send, Loader2, Trash2, ArrowRight, RotateCcw,
  LayoutDashboard, Search, Zap, Briefcase, Heart, User,
  Wrench, PenTool, BarChart3, ClipboardCheck, CalendarClock,
  Gift, BarChart2, Users, FileText, TrendingUp, UserCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** True when this assistant bubble holds a stream/fetch error, not a reply. */
  error?: boolean;
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
  { route: '/counsellor/parents', name: 'Parent Portal', description: 'Communication hub for parent updates and engagement.', icon: UserCircle },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

type ChatMode = 'student' | 'counsellor';

function storageKey(mode: ChatMode) {
  return `ascendi-chat-${mode}`;
}

function loadMessages(mode: ChatMode): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(storageKey(mode));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[], mode: ChatMode) {
  try {
    localStorage.setItem(storageKey(mode), JSON.stringify(messages));
  } catch { /* quota exceeded — ignore */ }
}

function detectMode(pathname: string): ChatMode {
  return pathname.startsWith('/counsellor') ? 'counsellor' : 'student';
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Extract route references like /dashboard, /toolbox/essay-workshop from text */
function extractRoutes(text: string): string[] {
  const matches = text.match(/\/[a-z][a-z0-9-/]*/gi) ?? [];
  return [...new Set(matches)];
}

/** Find page snippets that match routes mentioned in a message */
function getSnippetsForMessage(text: string, mode: ChatMode): PageSnippet[] {
  const snippets = mode === 'counsellor' ? COUNSELLOR_SNIPPETS : STUDENT_SNIPPETS;
  const routes = extractRoutes(text);
  return snippets.filter((s) =>
    routes.some((r) => r === s.route || r.startsWith(s.route + '/'))
  );
}

const STUDENT_SUGGESTIONS = [
  'How do I improve my match score?',
  'Where can I track my applications?',
  'Help me get started with essays',
  'What should I do first?',
];

const COUNSELLOR_SUGGESTIONS = [
  'How do I spot at-risk students?',
  'Show me the analytics dashboard',
  'How do I track deadlines across students?',
  'What can I do from this section?',
];

// ─── Page snippet card ──────────────────────────────────────────────────────

function PageCard({ snippet, onClick }: { snippet: PageSnippet; onClick: () => void }) {
  const Icon = snippet.icon;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[14px] border border-border bg-background p-2.5 text-left transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-sm"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">{snippet.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{snippet.description}</p>
      </div>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
    </button>
  );
}

// ─── Markdown message renderer ──────────────────────────────────────────────

function MessageContent({ content, onLinkClick }: { content: string; onLinkClick: () => void }) {
  return (
    <ReactMarkdown
      components={{
        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
        ul: ({ children }) => <ul className="mb-1.5 ml-3 list-disc space-y-0.5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-1.5 ml-3 list-decimal space-y-0.5 last:mb-0">{children}</ol>,
        li: ({ children }) => <li className="text-[13px]">{children}</li>,
        a: ({ href, children }) => {
          // Internal route → real navigation link (correct semantics: href,
          // middle-click/open-in-new-tab work). Closing the widget stays on the
          // click handler so the panel dismisses as the route changes.
          if (href?.startsWith('/')) {
            return (
              <Link
                href={href}
                onClick={onLinkClick}
                className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2 hover:text-primary/80"
              >
                {children}
              </Link>
            );
          }
          return (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2 hover:text-primary/80">
              {children}
            </a>
          );
        },
        code: ({ children }) => (
          <code className="rounded bg-muted px-1 py-0.5 text-[12px]">{children}</code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── Auto-resize textarea ───────────────────────────────────────────────────

function AutoResizeTextarea({
  value,
  onChange,
  onSubmit,
  disabled,
  inputRef,
}: {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  disabled: boolean;
  inputRef: React.RefObject<HTMLTextAreaElement>;
}) {
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <textarea
      ref={inputRef}
      value={value}
      onChange={handleInput}
      onKeyDown={handleKeyDown}
      placeholder="Ask Ascendi anything…"
      aria-label="Ask Ascendi anything"
      disabled={disabled}
      rows={1}
      className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
      style={{ maxHeight: 96 }}
    />
  );
}

// ─── Main widget ────────────────────────────────────────────────────────────

export function ChatbotWidget() {
  const pathname = usePathname();
  const router = useRouter();
  const mode = detectMode(pathname);
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(mode));
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null) as React.RefObject<HTMLTextAreaElement>;
  const prevModeRef = useRef(mode);
  const confirmTimerRef = useRef<number | null>(null);

  // Switch chat history when mode changes (student <-> counsellor)
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      setMessages(loadMessages(mode));
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

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const navigateTo = (route: string) => {
    router.push(route);
    setIsOpen(false);
  };

  // Stream an assistant reply for the given conversation. `history` must end
  // with the user message being answered; a fresh empty assistant bubble is
  // appended and filled as chunks arrive. On failure that bubble is marked as
  // an error row (rendered distinctly, with a Retry affordance).
  const runAssistant = async (history: Message[]) => {
    setIsLoading(true);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
    };

    setMessages([...history, assistantMessage]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          currentPage: pathname,
          mode,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Something went wrong');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') break;
              try {
                const parsed = JSON.parse(data);
                if (parsed.text) {
                  accumulated += parsed.text;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMessage.id
                        ? { ...m, content: accumulated }
                        : m
                    )
                  );
                }
              } catch {
                // skip malformed chunks
              }
            }
          }
        }
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : 'Something went wrong. Try again.';
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessage.id
            ? { ...m, content: errorText, error: true }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = (content: string) => {
    if (!content.trim() || isLoading) return;

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
    if (isLoading) return;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf('user');
    if (lastUserIdx === -1) return;
    const history = messages.slice(0, lastUserIdx + 1);
    setMessages(history);
    void runAssistant(history);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
            onClick={() => setIsOpen(true)}
            className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom,8px)+72px)] z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 transition-[transform,box-shadow] hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/30 active:translate-y-0 md:bottom-6 md:right-6 md:z-[60]"
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
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="fixed right-5 bottom-[calc(env(safe-area-inset-bottom,8px)+72px)] z-[55] flex h-[min(560px,calc(100vh-140px))] w-[min(400px,calc(100vw-40px))] flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-2xl md:bottom-6 md:right-6 md:z-[60] md:h-[min(560px,calc(100vh-40px))]"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="font-heading text-sm font-semibold text-foreground">Ascendi</p>
                  <p className="text-[11px] text-muted-foreground">
                    {mode === 'counsellor' ? 'Counsellor assistant' : 'Student assistant'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={handleClearClick}
                    className={cn(
                      'flex h-8 items-center justify-center gap-1 rounded-full transition-colors',
                      confirmClear
                        ? 'w-auto px-2.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400'
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
                    <Bot className="h-6 w-6 text-primary" />
                  </div>
                  <p className="font-heading text-sm font-semibold text-foreground">
                    Hey! I&apos;m Ascendi
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground max-w-[240px]">
                    {mode === 'counsellor'
                      ? 'I can help you manage your cohort, track progress, and navigate the counsellor tools.'
                      : 'I can help you navigate the platform, understand your profile, and plan applications.'}
                  </p>
                  <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                    {(mode === 'counsellor' ? COUNSELLOR_SUGGESTIONS : STUDENT_SUGGESTIONS).map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px] text-muted-foreground transition-[transform,border-color,color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:text-foreground hover:shadow-sm"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((msg) => {
                  const snippets = msg.role === 'assistant' && msg.content && !msg.error
                    ? getSnippetsForMessage(msg.content, mode)
                    : [];

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className={cn(
                        'flex flex-col',
                        msg.role === 'user' ? 'items-end' : 'items-start'
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[85%] break-words rounded-[16px] px-3.5 py-2.5 text-[13px] leading-relaxed',
                          msg.error
                            ? 'border border-rose-300/60 bg-rose-500/10 text-rose-700 dark:border-rose-500/30 dark:text-rose-300'
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
                              disabled={isLoading}
                              className="inline-flex items-center gap-1 rounded-full border border-rose-300/60 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-500/10 disabled:opacity-50 dark:border-rose-500/40 dark:text-rose-300"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Retry
                            </button>
                          </div>
                        ) : msg.content ? (
                          msg.role === 'assistant' ? (
                            <MessageContent content={msg.content} onLinkClick={() => setIsOpen(false)} />
                          ) : (
                            msg.content
                          )
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">Thinking…</span>
                          </div>
                        )}
                      </div>

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
              <div className="flex items-end gap-2 rounded-[18px] border border-border bg-background px-3 py-1.5 transition-colors focus-within:border-primary/40">
                <AutoResizeTextarea
                  value={input}
                  onChange={setInput}
                  onSubmit={() => sendMessage(input)}
                  disabled={isLoading}
                  inputRef={inputRef}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-[transform,opacity] hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
                  aria-label="Send message"
                >
                  {isLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
