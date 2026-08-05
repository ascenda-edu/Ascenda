'use client';

import { useState, useTransition } from 'react';
import Papa from 'papaparse';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trackEvent } from '@/lib/analytics';
import { useToast } from '@/components/ui/toast';

const templates = ['universities', 'programs', 'requirements', 'deadlines'] as const;
type Template = (typeof templates)[number];

export const ImportPanel = () => {
  const [template, setTemplate] = useState<Template>('universities');
  const [status, setStatus] = useState<string>('Awaiting upload');
  const [rowCount, setRowCount] = useState<number>(0);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const { showToast } = useToast();

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setError(null);
    setStatus('Parsing…');
    startParsing(() => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async (result: { data: Record<string, unknown>[] }) => {
          setRowCount(result.data.length);
          setRows(result.data);
          setStatus(`Parsed ${result.data.length} rows for ${template}. Review & sync.`);
          showToast({ title: 'CSV parsed', description: `Parsed ${result.data.length} rows for ${template}.`, variant: 'success' });
        },
        error: (parseError: Error) => {
          setStatus('Parsing failed');
          setError(parseError.message);
          showToast({ title: 'Parse failed', description: parseError.message, variant: 'error' });
        }
      });
    });
  };

  // Synchronous `() => void` event-handler boundary around an async body. An
  // `async` function handed to `onClick`/`onSubmit` returns a promise the DOM
  // discards, so a rejection is swallowed and the user is told nothing; the
  // terminal `.catch`/`.finally` below is the only exit for a failure.
  const syncRows = (): void => {
    if (!rows.length) return;
    setIsSyncing(true);
    setStatus('Syncing with Supabase…');
    setError(null);

    const run = async (): Promise<void> => {
      const response = await fetch('/api/admin/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, rows })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to sync data.');
      }

      setStatus(`Synced ${payload.count ?? rows.length} ${template} rows.`);
      showToast({ title: 'Import synced', description: `Uploaded ${payload.count ?? rows.length} ${template} rows.`, variant: 'success' });
      trackEvent('admin_import_synced', { template, count: payload.count ?? rows.length });
    };

    run()
      .catch((syncError: unknown) => {
        const message = syncError instanceof Error ? syncError.message : 'Sync failed.';
        setError(message);
        setStatus('Sync failed');
        showToast({ title: 'Import failed', description: message, variant: 'error' });
      })
      .finally(() => {
        setIsSyncing(false);
      });
  };

  return (
    // `surface-card` instead of a hand-rolled card: this one carried
    // `shadow-e-3`, the popover step, on a static page panel.
    <div className="surface-card space-y-4">
      <div className="space-y-2">
        <h2 className="font-heading text-xl font-semibold tracking-tight text-foreground">Import catalog data</h2>
        <p className="text-sm text-muted-foreground">
          Upload CSV exports to refresh the universities, programs, requirements, or deadlines catalog.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="template">Dataset</Label>
        {/* `name` belongs on the Root — Radix mirrors the value into a hidden
            native select so form submission keeps working. */}
        <Select
          name="template"
          value={template}
          disabled={isParsing || isSyncing}
          onValueChange={(value) => setTemplate(value as Template)}
        >
          <SelectTrigger id="template">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="csv-upload">Upload CSV</Label>
        {/* The input itself is `sr-only`, not `hidden`: it stays focusable, and
            the label picks the ring up through `peer-focus-visible` so keyboard
            users see the same affordance mouse users do. The dashed dropzone
            matches components/applications/document-uploader.tsx. */}
        <input
          id="csv-upload"
          type="file"
          accept=".csv"
          disabled={isParsing || isSyncing}
          onChange={handleFile}
          className="peer sr-only"
        />
        <label
          htmlFor="csv-upload"
          className={cn(
            'flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-muted p-6 text-center transition-colors',
            'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background',
            isParsing || isSyncing
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer hover:border-muted-foreground hover:bg-card'
          )}
        >
          <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
          <span className="text-sm font-semibold text-foreground">
            {fileName ?? 'Choose a CSV file'}
          </span>
          <span className="text-xs text-muted-foreground">
            One row per {template} record, with a header row.
          </span>
        </label>
      </div>
      <p className="text-sm text-muted-foreground" aria-busy={isParsing || isSyncing}>
        Status: {status}
      </p>
      {(isParsing || isSyncing) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary/60" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary/30" />
        </div>
      )}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="button" variant="outline" disabled={!rows.length || isSyncing} onClick={syncRows}>
        {isSyncing ? 'Syncing…' : 'Run data sync'}
      </Button>
      {rowCount > 0 ? (
        <p className="text-xs text-muted-foreground">Ready to sync {rowCount} rows. Server-side validation runs before upserts.</p>
      ) : null}
    </div>
  );
};
