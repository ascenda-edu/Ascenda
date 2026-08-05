'use client';

import { CheckCircle2 } from 'lucide-react';
import { emphasize } from './rich-text';

/**
 * Entry-requirement prose out of the catalogue is one long string that may fold
 * a standard offer and a contextual offer together. Split them, then split each
 * half into a list when the text gives us something to split on.
 */
const RequirementList = ({ text, title }: { text: string; title?: string }) => {
  if (!text) return null;

  // Remove any leading "Typical Offer:" / "Entry Requirements:" prefix.
  const cleanText = text.replace(/^(Typical Offer:|Entry Requirements:)/i, '').trim();

  let items: string[] = [];

  if (cleanText.includes(';')) {
    items = cleanText.split(';').map((s) => s.trim()).filter(Boolean);
  } else if (cleanText.includes('•') || cleanText.includes('- ')) {
    items = cleanText.split(/[•-]/).map((s) => s.trim()).filter(Boolean);
  } else if (cleanText.length > 150) {
    // A long paragraph gets broken at sentence boundaries so it is scannable.
    // Period + space + capital, so "A.B." style acronyms survive.
    items = cleanText.split(/(?<=\.)\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
  } else {
    items = [cleanText];
  }

  return (
    <div className="space-y-3">
      {title ? (
        <h4 className="font-sans eyebrow-accent flex items-center gap-2">
          <span className="h-px w-4 bg-primary/30" aria-hidden />
          {title}
        </h4>
      ) : null}

      {items.length === 1 ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{emphasize(items[0])}</p>
      ) : (
        <ul className="grid gap-3">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3 text-sm transition-colors hover:bg-border"
            >
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary-ink" aria-hidden />
              <span className="leading-relaxed text-foreground">{emphasize(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const RequirementRenderer = ({ value }: { value: string }) => {
  const parts = value.split(/Typical Contextual Offer:|Contextual Offer:/i);
  const standard = parts[0].trim();
  const contextual = parts.length > 1 ? parts[1].trim() : null;

  return (
    <div className="space-y-6">
      <RequirementList text={standard} />
      {contextual ? <RequirementList text={contextual} title="Contextual Offer" /> : null}
    </div>
  );
};
