'use client';

import { Mail, Calendar, Briefcase } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEMO_COUNSELLOR } from '@/lib/demo/counsellor';

type Connector = {
  id: string;
  name: string;
  icon: typeof Mail;
  status: 'connected' | 'coming_soon';
  detail: string;
};

const CONNECTORS: Connector[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    icon: Mail,
    status: 'connected',
    detail: `${DEMO_COUNSELLOR.fullName.toLowerCase().replace(/\s+/g, '.')}@stmartins.edu`
  },
  {
    id: 'gcal',
    name: 'Google Calendar',
    icon: Calendar,
    status: 'connected',
    detail: "Next: student 1:1 · Wed 3pm"
  },
  {
    id: 'outlook',
    name: 'Outlook',
    icon: Briefcase,
    status: 'coming_soon',
    detail: 'Coming soon'
  }
];

export function ConnectorsRow() {
  return (
    <div className="surface-card surface-card--static">
      <div className="relative z-10 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Plugged in
            </p>
            <h2 className="text-lg font-semibold text-foreground">Your tech stack</h2>
            <p className="text-xs text-muted-foreground">
              Ascenda sits alongside the tools you already use. We don&apos;t replace them — we route them.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTORS.map((connector) => {
            const Icon = connector.icon;
            const connected = connector.status === 'connected';
            return (
              <div
                key={connector.id}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-3 transition',
                  connected
                    ? 'border-border/60 bg-background/60'
                    : 'border-dashed border-border/50 bg-muted/30 opacity-80'
                )}
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    connected ? 'bg-primary/10 text-primary' : 'bg-muted/50 text-muted-foreground'
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{connector.name}</p>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.15em]',
                        connected
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'bg-muted/60 text-muted-foreground'
                      )}
                    >
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          connected ? 'bg-emerald-500' : 'bg-muted-foreground/60'
                        )}
                        aria-hidden
                      />
                      {connected ? 'Connected' : 'Soon'}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground" title={connector.detail}>
                    {connector.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
