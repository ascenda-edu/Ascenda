'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface MobileFilterSheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  activeFilterCount: number;
  onClearAll: () => void;
}

export function MobileFilterSheet({ open, onClose, children, activeFilterCount, onClearAll }: MobileFilterSheetProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)} align="left">
      <DialogContent className="flex flex-col bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 dark:border-white/10">
          <DialogTitle className="font-heading text-base font-semibold text-foreground">Filters</DialogTitle>
          <div className="flex items-center gap-1">
            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={onClearAll}
                className="rounded-full px-2 py-1 text-sm font-medium text-primary-ink transition-colors cursor-pointer hover:text-primary-ink/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Clear all
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close filters"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground transition-colors cursor-pointer hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-1">{children}</div>

        <div className="border-t border-border p-4 dark:border-white/10">
          <Button type="button" onClick={onClose} className="w-full">
            Show results
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
