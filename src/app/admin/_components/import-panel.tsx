'use client';

import { useState, useTransition } from 'react';
import Papa from 'papaparse';
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
  const [error, setError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const { showToast } = useToast();

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

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

  const syncRows = async () => {
    if (!rows.length) return;
    setIsSyncing(true);
    setStatus('Syncing with Supabase…');
    setError(null);

    try {
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
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : 'Sync failed.';
      setError(message);
      setStatus('Sync failed');
      showToast({ title: 'Import failed', description: message, variant: 'error' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-4 rounded-4xl border border-border bg-card p-6 shadow-e-3 transition-colors">
      <div className="space-y-2">
        <h2 className="font-heading text-2xl font-semibold tracking-tight text-foreground">Import catalog data</h2>
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
        <input
          id="csv-upload"
          type="file"
          accept=".csv"
          disabled={isParsing || isSyncing}
          onChange={handleFile}
          className="text-sm text-muted-foreground file:mr-4 file:rounded-2xl file:border file:border-border file:bg-muted/60 file:px-4 file:py-2 file:text-foreground"
        />
      </div>
      <p className="text-sm text-muted-foreground" aria-busy={isParsing || isSyncing}>
        Status: {status}
      </p>
      {(isParsing || isSyncing) && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground" aria-hidden>
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary/70" />
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary/50" />
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
