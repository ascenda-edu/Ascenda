'use client';

import { useState, type ReactNode } from 'react';
import { Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SendMessageModal, type SendMessageStudent, type SendMessageReason } from './send-message-modal';

interface MessageStudentButtonProps {
  student: SendMessageStudent;
  reason?: SendMessageReason;
  /** Pre-styled variant. Pass null to opt out and provide your own className. */
  variant?: 'header' | 'nudge' | null;
  /** Override the button content if you need a different label/icon combo. */
  children?: ReactNode;
  /** Appended to the variant classes; or used solo when variant is null. */
  className?: string;
  ariaLabel?: string;
}

const VARIANT_CLASSES = {
  header:
    'flex items-center justify-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary transition hover:-translate-y-0.5 hover:bg-primary/20',
  nudge:
    'flex shrink-0 items-center gap-2 self-start rounded-full border border-border bg-background px-4 py-2 text-xs font-semibold text-foreground transition hover:-translate-y-0.5 hover:bg-muted/60'
} as const;

export function MessageStudentButton({
  student,
  reason = 'general',
  variant = 'header',
  children,
  className,
  ariaLabel
}: MessageStudentButtonProps) {
  const [open, setOpen] = useState(false);

  const defaultContent = (
    <>
      <Mail className={variant === 'nudge' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      {variant === 'nudge' ? `Nudge ${student.firstName}` : 'Message'}
    </>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel ?? `Message ${student.firstName} ${student.lastName}`}
        className={cn(variant ? VARIANT_CLASSES[variant] : null, className)}
      >
        {children ?? defaultContent}
      </button>
      <SendMessageModal open={open} onOpenChange={setOpen} student={student} reason={reason} />
    </>
  );
}
