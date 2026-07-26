'use client';

// Compact programme card rendered under an assistant bubble when the model
// runs search_programs. Student mode links through to the course detail page
// (path built ONLY from hit.id); counsellor/parent modes render a static card
// (no student-app links out of their portals). All fields are plain JSX text —
// never dangerouslySetInnerHTML, never a hit-supplied href.

import Link from 'next/link';
import { GraduationCap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMode } from '@/lib/chat/prompts';
import type { ProgramHit } from '@/lib/chat/tools';

interface ProgramResultCardProps {
  hit: ProgramHit;
  mode: ChatMode;
}

export function ProgramResultCard({ hit, mode }: ProgramResultCardProps) {
  const meta = `${hit.university} · ${hit.country}${hit.city ? ` · ${hit.city}` : ''}`;

  const inner = (
    <>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <GraduationCap className="h-4 w-4 text-primary-ink" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-foreground">{hit.course}</p>
        <p className="truncate text-label text-muted-foreground">{meta}</p>
      </div>
      {hit.level ? (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-label font-medium text-muted-foreground">
          {hit.level}
        </span>
      ) : null}
    </>
  );

  const shared =
    'flex w-full items-center gap-3 rounded-xl border border-border bg-background p-2.5 text-left';

  if (mode === 'student') {
    return (
      <Link
        href={`/course/${encodeURIComponent(hit.id)}`}
        className={cn(
          shared,
          'transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-e-1'
        )}
      >
        {inner}
      </Link>
    );
  }

  return <div className={shared}>{inner}</div>;
}
