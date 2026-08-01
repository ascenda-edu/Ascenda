'use client';

import { useMemo, useRef, useState } from 'react';
import { Upload, FileText, FileEdit, Folder } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useSupabase } from '@/hooks/useSupabase';
import { trackEvent } from '@/lib/analytics';

interface DocumentUploaderProps {
  applicationId?: string | null;
  taskId?: string | null;
  onUpload?: (file: File) => Promise<void>;
  /** Fires after a file is successfully uploaded and recorded via the built-in path. */
  onUploaded?: () => void;
}

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

export const DocumentUploader = ({ applicationId, taskId, onUpload, onUploaded }: DocumentUploaderProps) => {
  const supabase = useSupabase();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploaded, setUploaded] = useState<{ name: string; url?: string }[]>([]);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const bucket = useMemo(() => process.env.NEXT_PUBLIC_SUPABASE_STORAGE_BUCKET ?? 'application-documents', []);

  // Shared validation + upload path for both the file input and drag-drop.
  const processFiles = async (files: File[]) => {
    if (!files.length || isUploading) return;
    setError(null);

    const oversize = files.find((file) => file.size > 20 * 1024 * 1024);
    if (oversize) {
      setStatus(null);
      setError(`File ${oversize.name} exceeds 20 MB limit.`);
      return;
    }

    const invalid = files.find((file) => {
      const extension = file.name.split('.').pop()?.toLowerCase();
      return !(
        allowedMimeTypes.has(file.type) ||
        (extension && ['pdf', 'doc', 'docx'].includes(extension))
      );
    });
    if (invalid) {
      setStatus(null);
      setError(`File ${invalid.name} is not a PDF or Word document.`);
      return;
    }

    if (!onUpload) {
      setIsUploading(true);
      // Start a fresh list per batch — otherwise successive uploads pile up.
      setUploaded([]);
      setStatus(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);

      try {
        const {
          data: { user },
          error: userError
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setError('You need to be signed in to upload a document.');
          setStatus(null);
          return;
        }

        for (const file of files) {
          const extension = file.name.split('.').pop()?.toLowerCase();
          const scope = applicationId ? `applications/${applicationId}` : 'unassigned';
          const taskSegment = taskId ? `task-${taskId}/` : '';
          const ownerSegment = applicationId ? '' : `${user.id}/`;
          const path = `${scope}/${ownerSegment}${taskSegment}${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
          const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
            upsert: false,
            contentType: file.type || undefined
          });

          if (uploadError) {
            throw uploadError;
          }

          if (applicationId) {
            const { error: insertError } = await supabase.from('documents').insert({
              application_id: applicationId,
              name: file.name,
              type: file.type || extension,
              storage_path: path
            });
            if (insertError) {
              await supabase.storage.from(bucket).remove([path]);
              throw insertError;
            }
          }

          const { data: signedUrl } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
          setUploaded((prev) => [...prev, { name: file.name, url: signedUrl?.signedUrl }]);
          trackEvent('document_uploaded', { fileName: file.name, bucket });
        }

        setStatus(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}`);
        if (applicationId) onUploaded?.();
      } catch (uploadError) {
        const message = uploadError instanceof Error ? uploadError.message : 'Unable to upload document.';
        setError(message);
        setStatus(null);
      } finally {
        setIsUploading(false);
      }
      return;
    }

    setIsUploading(true);
    setStatus('Uploading…');
    try {
      for (const file of files) {
        await onUpload(file);
        trackEvent('document_uploaded_custom_handler', { fileName: file.name });
      }
      setStatus(`Uploaded ${files.length} file${files.length > 1 ? 's' : ''}`);
    } catch (customError) {
      const message = customError instanceof Error ? customError.message : 'Upload failed.';
      setError(message);
      setStatus(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    // Reset the input so selecting the same file again (e.g. after a failed
    // upload) still fires a change event.
    event.target.value = '';
    await processFiles(files);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isUploading) setIsDragActive(true);
  };

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    // Ignore dragleave events fired while moving between child elements inside
    // the drop zone — only clear when the pointer actually leaves the zone.
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragActive(false);
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
    if (isUploading) return;
    await processFiles(Array.from(event.dataTransfer.files ?? []));
  };

  return (
    <div className="surface-card space-y-4 rounded-4xl p-6 text-sm">
      <div>
        <Label htmlFor="document-upload">Upload document</Label>
        <p className="text-xs text-muted-foreground">PDF, DOCX up to 20 MB.</p>
      </div>
      <label
        htmlFor="document-upload"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border border-dashed p-8 text-center transition ${
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-border bg-muted/60 hover:border-muted-foreground hover:bg-card'
        }`}
      >
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-semibold text-foreground">
          {isDragActive ? 'Drop files to upload' : 'Drag & drop or click to browse'}
        </p>
        <p className="text-xs text-muted-foreground">We auto-tag the document to the right checklist item.</p>
      </label>
      <input
        ref={fileInputRef}
        id="document-upload"
        type="file"
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {status ?? 'No document selected yet.'}
      </p>
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {uploaded.length ? (
        <ul className="space-y-2 text-xs text-muted-foreground">
          {uploaded.map((item) => {
            const ext = item.name.split('.').pop()?.toLowerCase() ?? '';
            const Icon = ext === 'pdf' ? FileText : ext === 'doc' || ext === 'docx' ? FileEdit : Folder;
            return (
              <li key={`${item.name}-${item.url ?? 'local'}`} className="flex items-center justify-between gap-3 rounded-2xl border border-border px-3 py-2">
                <span className="flex items-center gap-2 truncate font-medium">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="truncate">{item.name}</span>
                </span>
              {item.url ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="eyebrow hover:text-foreground"
                >
                  View
                </a>
              ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="soft"
          disabled={isUploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {isUploading ? 'Uploading…' : 'Upload files'}
        </Button>
        <Button type="button" variant="ghost" disabled title="Coming soon">
          Google Drive · coming soon
        </Button>
      </div>
    </div>
  );
};
