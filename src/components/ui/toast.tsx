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
      <button
        className="text-muted-foreground transition hover:text-foreground"
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
    <div className="pointer-events-none fixed bottom-4 right-4 z-toast flex flex-col gap-3 sm:bottom-6 sm:right-6">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
