'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Award,
  BookOpen,
  Bot,
  CalendarClock,
  CalendarPlus,
  ClipboardCheck,
  Compass,
  FileText,
  Home,
  ListChecks,
  Search,
  Sparkles,
  Star,
  Target,
  UserCircle,
  Users,
  type LucideIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: LucideIcon;
  group: 'Go to' | 'Actions' | 'Help';
  keywords?: string[];
}

const COMMANDS: CommandItem[] = [
  // Go to ─────────────────────────────────────────────────────────────────
  { id: 'goto-dashboard', label: 'Dashboard', hint: 'Today\'s focus', href: '/dashboard', icon: Home, group: 'Go to' },
  { id: 'goto-explore', label: 'Explore universities', hint: 'Search the catalog', href: '/university-search/search', icon: Search, group: 'Go to', keywords: ['search', 'discover'] },
  { id: 'goto-matches', label: 'Matches', hint: 'Recommendations for you', href: '/matches', icon: Target, group: 'Go to' },
  { id: 'goto-shortlist', label: 'Shortlist', hint: 'Saved programs', href: '/university-search/shortlist', icon: Star, group: 'Go to', keywords: ['saved'] },
  { id: 'goto-applications', label: 'Applications', hint: 'Plan & track', href: '/applications', icon: ClipboardCheck, group: 'Go to' },
  { id: 'goto-tasks', label: 'Tasks', hint: 'Open task board', href: '/applications/tasks', icon: ListChecks, group: 'Go to' },
  { id: 'goto-documents', label: 'Documents', hint: 'Uploads & references', href: '/applications/documents', icon: FileText, group: 'Go to' },
  { id: 'goto-scholarships', label: 'Scholarships', hint: 'Browse awards', href: '/scholarships', icon: Award, group: 'Go to' },
  { id: 'goto-toolbox', label: 'Toolbox', hint: 'Essay, chances, deadlines', href: '/toolbox', icon: Sparkles, group: 'Go to' },
  { id: 'goto-essay', label: 'Essay workshop', href: '/toolbox/essay-workshop', icon: BookOpen, group: 'Go to' },
  { id: 'goto-chances', label: 'Chances calculator', href: '/toolbox/chances', icon: Target, group: 'Go to' },
  { id: 'goto-requirements', label: 'Requirements checker', href: '/toolbox/requirements', icon: ClipboardCheck, group: 'Go to' },
  { id: 'goto-timeline', label: 'Deadline timeline', href: '/toolbox/timeline', icon: CalendarClock, group: 'Go to' },
  { id: 'goto-profile', label: 'Profile', hint: 'Your information', href: '/profile', icon: UserCircle, group: 'Go to' },
  { id: 'goto-counsellor', label: 'Counsellor view', hint: 'Faculty surface', href: '/counsellor', icon: Users, group: 'Go to', keywords: ['faculty'] },
  { id: 'goto-assistant', label: 'Assistant', hint: 'AI workspace', href: '/assistant', icon: Bot, group: 'Go to', keywords: ['ai', 'chat', 'ascendi'] },

  // Actions ───────────────────────────────────────────────────────────────
  { id: 'action-wizard', label: 'Open profile wizard', href: '/profile/wizard', icon: Compass, group: 'Actions', keywords: ['edit profile'] },
  { id: 'action-appointment', label: 'Request an appointment', href: '/appointment', icon: CalendarPlus, group: 'Actions', keywords: ['counsellor', 'meeting'] },

  // Help ──────────────────────────────────────────────────────────────────
  { id: 'help-shortcuts', label: 'Keyboard shortcuts', hint: 'Cmd+K · Cmd+B', href: '#shortcuts', icon: Sparkles, group: 'Help' }
];

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const fuzzyScore = (haystack: string, needle: string): number => {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n) return 1000;
  if (h.startsWith(n)) return 800;
  if (h.includes(n)) return 600;
  // letter-by-letter sequence match
  let hi = 0;
  let score = 0;
  for (let ni = 0; ni < n.length; ni += 1) {
    const found = h.indexOf(n[ni], hi);
    if (found < 0) return 0;
    score += 100 - (found - hi);
    hi = found + 1;
  }
  return Math.max(score, 1);
};

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const isMacRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      isMacRef.current = navigator.platform.toUpperCase().includes('MAC');
    }
  }, []);

  // Cmd/Ctrl+K toggles. Esc handled in input keydown.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Reset state on close; move focus into the palette on open and restore it
  // to the previously focused element on close.
  useEffect(() => {
    if (open) {
      previouslyFocused.current = document.activeElement as HTMLElement | null;
      // Defer focus until after the modal mounts.
      const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
    setQuery('');
    setActiveIndex(0);
    previouslyFocused.current?.focus?.();
    previouslyFocused.current = null;
    return undefined;
  }, [open]);

  // Trap Tab focus within the palette dialog.
  const onDialogKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const node = dialogRef.current;
    if (!node) return;
    const focusables = Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null
    );
    if (focusables.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const ranked = useMemo(() => {
    if (!query.trim()) return COMMANDS;
    return COMMANDS
      .map((cmd) => {
        const labelScore = fuzzyScore(cmd.label, query) * 2;
        const hintScore = cmd.hint ? fuzzyScore(cmd.hint, query) : 0;
        const keywordScore = cmd.keywords?.reduce((max, kw) => Math.max(max, fuzzyScore(kw, query)), 0) ?? 0;
        const score = Math.max(labelScore, hintScore, keywordScore);
        return { cmd, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.cmd);
  }, [query]);

  const grouped = useMemo(() => {
    const groups: Record<CommandItem['group'], CommandItem[]> = { 'Go to': [], Actions: [], Help: [] };
    ranked.forEach((cmd) => groups[cmd.group].push(cmd));
    return groups;
  }, [ranked]);

  const flat = useMemo(() => [...grouped['Go to'], ...grouped.Actions, ...grouped.Help], [grouped]);

  // Clamp active index when results change.
  useEffect(() => {
    setActiveIndex((prev) => Math.min(prev, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  const runCommand = useCallback(
    (cmd: CommandItem) => {
      setOpen(false);
      if (cmd.href.startsWith('#')) return;
      router.push(cmd.href);
    },
    [router]
  );

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % Math.max(1, flat.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + Math.max(1, flat.length)) % Math.max(1, flat.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const cmd = flat[activeIndex];
      if (cmd) runCommand(cmd);
    }
  };

  const modKey = isMacRef.current ? '⌘' : 'Ctrl';

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[100] flex items-start justify-center bg-background/70 backdrop-blur-sm px-4 pt-24"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Command menu"
        >
          <motion.div
            ref={dialogRef}
            onKeyDown={onDialogKeyDown}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="h-4 w-4 text-muted-foreground" aria-hidden />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Search pages, actions, or just type…"
                className="h-12 w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                aria-label="Search commands"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd className="hidden text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:inline">
                Esc
              </kbd>
            </div>

            <div className="max-h-[60vh] overflow-y-auto overscroll-contain p-2">
              {flat.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-muted-foreground">
                  No results for &quot;{query}&quot;
                </div>
              ) : (
                (Object.keys(grouped) as Array<CommandItem['group']>).map((groupKey) => {
                  const items = grouped[groupKey];
                  if (items.length === 0) return null;
                  return (
                    <div key={groupKey} className="px-1 pb-2">
                      <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                        {groupKey}
                      </p>
                      <div className="space-y-0.5">
                        {items.map((cmd) => {
                          const flatIndex = flat.indexOf(cmd);
                          const isActive = flatIndex === activeIndex;
                          const Icon = cmd.icon;
                          return (
                            <button
                              key={cmd.id}
                              type="button"
                              onMouseEnter={() => setActiveIndex(flatIndex)}
                              onClick={() => runCommand(cmd)}
                              className={cn(
                                'flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors',
                                isActive ? 'bg-primary/10 text-foreground' : 'text-foreground hover:bg-muted/60'
                              )}
                            >
                              <span
                                className={cn(
                                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
                                  isActive ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                                )}
                              >
                                <Icon className="h-3.5 w-3.5" aria-hidden />
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block truncate font-medium">{cmd.label}</span>
                                {cmd.hint ? (
                                  <span className="block truncate text-xs text-muted-foreground">{cmd.hint}</span>
                                ) : null}
                              </span>
                              {isActive ? (
                                <kbd className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                  ↵
                                </kbd>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono">↑↓</kbd>
                  navigate
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono">↵</kbd>
                  open
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-border bg-background px-1 py-0.5 font-mono">Esc</kbd>
                  close
                </span>
              </div>
              <span className="hidden sm:inline">
                {modKey}K to toggle · {modKey}B for sidebar
              </span>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * Tiny trigger button. Renders the user-visible "press ⌘K" affordance
 * inside the navbar.
 */
export function CommandPaletteTrigger() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMac(navigator.platform.toUpperCase().includes('MAC'));
    }
  }, []);

  const dispatchOpen = () => {
    if (typeof window === 'undefined') return;
    // Fake the keyboard event so we don't need a context — keeps the trigger
    // and the palette decoupled. The palette listens on Cmd/Ctrl+K.
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true
    });
    window.dispatchEvent(event);
  };

  return (
    <button
      type="button"
      onClick={dispatchOpen}
      className="hidden h-9 items-center gap-2 rounded-full border border-border bg-card/80 px-3 text-xs font-medium text-muted-foreground shadow-sm transition hover:bg-muted/60 hover:text-foreground sm:inline-flex"
      aria-label="Open command palette"
    >
      <Search className="h-3.5 w-3.5" aria-hidden />
      <span>Quick search</span>
      <kbd className="ml-1 rounded border border-border bg-background px-1 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        {isMac ? '⌘K' : 'Ctrl K'}
      </kbd>
    </button>
  );
}

/**
 * A simpler always-visible icon trigger for small viewports / mobile.
 */
export function CommandPaletteIconTrigger() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsMac(navigator.platform.toUpperCase().includes('MAC'));
    }
  }, []);

  const dispatchOpen = () => {
    if (typeof window === 'undefined') return;
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true
    });
    window.dispatchEvent(event);
  };

  return (
    <button
      type="button"
      onClick={dispatchOpen}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card/80 text-muted-foreground shadow-sm transition hover:bg-muted/60 hover:text-foreground sm:hidden"
      aria-label="Open command palette"
    >
      <Search className="h-4 w-4" aria-hidden />
    </button>
  );
}
