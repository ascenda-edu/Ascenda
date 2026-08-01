'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, FileEdit, Folder, type LucideIcon } from 'lucide-react';
import { DocumentUploader } from './document-uploader';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface DocumentManagerApp {
  id: string;
  label: string;
}

export interface ManagedDocument {
  id: string;
  name: string;
  type: string | null;
  uploadedAt: string | null;
  application: string;
  url: string | null;
}

interface DocumentsManagerProps {
  applications: DocumentManagerApp[];
  documents: ManagedDocument[];
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function iconFor(name: string): LucideIcon {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return FileText;
  if (ext === 'doc' || ext === 'docx') return FileEdit;
  return Folder;
}

export function DocumentsManager({ applications, documents }: DocumentsManagerProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>(applications[0]?.id ?? '');

  return (
    <div className="space-y-6">
      {applications.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-5 py-4 text-sm text-muted-foreground">
          Add an application first — documents attach to a specific application so your counsellor can see them in
          context. Start one from your{' '}
          <a href="/university-search/shortlist" className="font-semibold text-primary-ink hover:underline">
            shortlist
          </a>
          .
        </div>
      ) : (
        <div className="space-y-3">
          <label htmlFor="doc-application" className="text-xs font-semibold text-foreground">
            Attach to application
          </label>
          <Select value={selected || ''} onValueChange={setSelected}>
            <SelectTrigger id="doc-application" className="sm:max-w-md">
              <SelectValue placeholder="Choose an application" />
            </SelectTrigger>
            <SelectContent>
              {applications.map((app) => (
                <SelectItem key={app.id} value={app.id}>
                  {app.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DocumentUploader applicationId={selected} onUploaded={() => router.refresh()} />
        </div>
      )}

      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No documents yet"
          description="Upload a transcript, essay, or certificate above and it'll show up here."
        />
      ) : (
        <div className="space-y-3">
          {documents.map((doc) => {
            const DocIcon = iconFor(doc.name);
            return (
            <div
              key={doc.id}
              className="flex items-center gap-4 rounded-2xl border border-border/60 bg-background/60 px-5 py-4"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary-ink" aria-hidden>
                <DocIcon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">{doc.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {doc.application}
                  {doc.type ? ` · ${doc.type}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <p className="text-right text-xs text-muted-foreground">{formatDate(doc.uploadedAt)}</p>
                {doc.url ? (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="eyebrow transition hover:text-foreground"
                  >
                    View
                  </a>
                ) : null}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
