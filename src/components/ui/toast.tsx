'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

export type Toast = {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  /**
   * Auto-dismiss delay in ms. Defaults to 5000 (8000 for errors).
   * Pass 0 to keep the toast until it is dismissed manually.
   */
  duration?: number;
};

type ToastContextValue = {
  toasts: Toast[];
  showToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    setToasts((prev) => [...prev, { ...toast, id: crypto.randomUUID() }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const value = useMemo(() => ({ toasts, showToast, dismissToast }), [toasts, showToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

// Tone tokens, not palette literals. `danger` (not `destructive`) is the status
// tone: `destructive` is reserved for destructive ACTIONS, and an error toast is
// feedback. Both tones are AA-verified in each theme, so no `dark:` variants.
const toneClass = (variant?: ToastVariant) =>
  variant === 'success'
    ? 'border-success/30 bg-success-subtle text-success'
    : variant === 'error'
      ? 'border-danger/30 bg-danger-subtle text-danger'
      : 'border-border bg-card text-foreground';

const resolveDuration = (toast: Toast) => {
  if (typeof toast.duration === 'number') return toast.duration;
  return toast.variant === 'error' ? 8000 : 5000;
};

const ToastCard = ({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) => {
  const { id } = toast;
  const duration = resolveDuration(toast);

  // Auto-dismiss after `duration` ms; 0 keeps the toast until manually
  // dismissed. Manual dismissal unmounts the card, so the cleanup below
  // clears the pending timer.
  useEffect(() => {
    if (duration <= 0) return;
    const timer = window.setTimeout(() => onDismiss(id), duration);
    return () => window.clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex min-w-[240px] max-w-sm items-start gap-3 rounded-2xl border p-4 shadow-e-4',
        toneClass(toast.variant)
      )}
      role={toast.variant === 'error' ? 'alert' : 'status'}
    >
      <div className="flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description ? <p className="text-xs text-muted-foreground">{toast.description}</p> : null}
      </div>
      {/* WCAG 2.5.8 (AA) sets a 24x24 CSS px floor on pointer targets. A bare
          <button> around a 16px icon is a 16x16 target — the smallest one in the
          app, and it ships on every route because the provider is mounted in the
          root tree. The icon must stay 16px (a bigger X reads as a second action
          competing with the toast's own copy), so the target grows via an inset
          ::after instead: -inset-3.5 is 14px on each side, 16 + 28 = 44, which
          clears the AA floor and hits the house 44px guideline (G6) without
          moving a single pixel of layout. Needs `relative` for the ::after to
          resolve against, and no ancestor here clips it — the card is
          `rounded-2xl p-4` with no overflow-hidden, so the hit box may spill
          ~10px past the card edge into the pointer-events-none viewport, where
          it overlaps nothing. */}
      <button
        className='relative inline-flex text-muted-foreground transition after:absolute after:-inset-3.5 after:content-[""] hover:text-foreground'
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

const ToastViewport = ({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) => {
  return (
    // z-toast (300), not z-50: at z-50 the viewport sat BEHIND the help thread
    // drawer (z-modal) that raises most of these toasts, so success/error
    // feedback was invisible exactly when it mattered.
    //
    // The bottom offset is the same fluid expression the chat launcher dock uses
    // (chat/chatbot-widget.tsx:509). At a flat `bottom-4` the toast landed inside
    // the mobile nav's ~74px band and under the iPhone home indicator, so the
    // dismiss target was physically unreachable on the exact viewport where a
    // 44px target matters most. env(safe-area-inset-bottom,8px)+72px clears both.
    // The step back to `bottom-6` is at `md`, NOT `sm`: mobile-nav.tsx is
    // `md:hidden`, so an `sm:` step would put the toast back under the nav for
    // the whole 640–768px band.
    <div className="pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom,8px)+72px)] right-4 z-toast flex flex-col gap-3 sm:right-6 md:bottom-6">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
