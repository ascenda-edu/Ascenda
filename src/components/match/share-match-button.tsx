'use client';

import { useState } from 'react';
import { Check, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShareMatchButtonProps {
  programName: string;
  universityName: string;
  shareUrl?: string;
}

export function ShareMatchButton({ programName, universityName, shareUrl }: ShareMatchButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = shareUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
    const shareData = {
      title: `${programName} at ${universityName}`,
      text: `Check out ${programName} at ${universityName} on Ascenda`,
      url
    };

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard.
      }
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        // Clipboard not available — silently no-op.
      }
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={handleShare} className="gap-2">
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Share2 className="h-4 w-4" aria-hidden />}
        {copied ? 'Link copied' : 'Share'}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? 'Link copied to clipboard' : ''}
      </span>
    </>
  );
}
