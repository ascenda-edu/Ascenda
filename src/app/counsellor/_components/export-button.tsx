'use client';

import { Printer } from 'lucide-react';

export const ExportButton = () => {
  return (
    <button
      onClick={() => window.print()}
      className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-e-1 transition hover:-translate-y-0.5 hover:border-primary/40 hover:text-primary-ink print:hidden"
    >
      <Printer className="h-4 w-4" />
      Print Report
    </button>
  );
};
