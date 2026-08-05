'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';

/**
 * The palette's LIGHT half: the Cmd/Ctrl+K listener, the open state, and the two
 * trigger buttons. Nothing here costs more than a `Search` icon.
 *
 * The body — three command tables, 22 icons, the fuzzy matcher and
 * `ui/dialog.tsx` with @radix-ui/react-dialog behind it — lives in
 * `./command-palette-dialog` and is fetched as its own chunk after hydration.
 * `<CommandPalette />` is rendered by `layout/shell.tsx` on every authenticated
 * route, so a static import measured **+27 kB gzip** on `/dashboard`,
 * `/matches`, `/profile` and `/inbox` — for a panel that starts closed.
 * Same pattern (and the same reason) as `chat/chatbot-widget-lazy.tsx`.
 *
 * `ssr: false` is legal because this file is a Client Component; it is forbidden
 * in Server Components (CLAUDE.md).
 */
const CommandPaletteDialog = dynamic(
  () => import('./command-palette-dialog').then((mod) => mod.CommandPaletteDialog),
  { ssr: false }
);

export function CommandPalette() {
  const [open, setOpen] = useState(false);

  // Cmd/Ctrl+K toggles. The state lives HERE, above the lazy boundary, so a
  // keypress landing before the chunk arrives is still honoured — the dialog
  // simply mounts open the moment it loads.
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

  return <CommandPaletteDialog open={open} onOpenChange={setOpen} />;
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
      className="hidden h-9 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-muted-foreground shadow-e-1 transition hover:bg-primary/30 hover:text-foreground sm:inline-flex"
      aria-label="Open command palette"
    >
      <Search className="h-3.5 w-3.5" aria-hidden />
      <span>Quick search</span>
      <kbd className="ml-1 rounded border border-border bg-background px-1 py-0.5 font-mono text-label uppercase tracking-wider text-muted-foreground">
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
      className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-muted-foreground shadow-e-1 transition hover:bg-primary/30 hover:text-foreground sm:hidden"
      aria-label="Open command palette"
    >
      <Search className="h-4 w-4" aria-hidden />
    </button>
  );
}
