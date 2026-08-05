'use client';

import { Bookmark, BookmarkCheck } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useShortlist } from '@/components/university-search/shortlist-store';
import { cn } from '@/lib/utils';
import { ACTION_TEXT } from '@/lib/constants/text';

// One control, one label. There used to be a second 'planner' variant whose
// strings also said "shortlist" — same action, two names, and the labels are
// mostly read as aria-label on the icon-only form where the distinction was
// invisible anyway.
const LABELS = {
  idle: ACTION_TEXT.shortlist,
  active: ACTION_TEXT.shortlisted
};

type TrackProgramButtonProps = {
  programId: string;
  programName: string;
  universityName: string;
  location?: string;
  fitScore?: number | null;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  className?: string;
  /** Icon-only bookmark button — for tight card action rows where a second
   * text label can't fit. The label still reaches AT via aria-label/title. */
  iconOnly?: boolean;
};

export const TrackProgramButton = ({
  programId,
  programName,
  universityName,
  location,
  fitScore,
  size = 'sm',
  variant,
  className,
  iconOnly = false
}: TrackProgramButtonProps) => {
  const { items, addItem, removeItem } = useShortlist();
  const isTracked = items.some((item) => item.id === programId);

  const handleClick = () => {
    if (isTracked) {
      removeItem(programId);
      return;
    }
    addItem({
      id: programId,
      name: universityName,
      program: programName,
      stage: 'Researching',
      fitScore,
      nextAction: 'Review program details',
      due: null,
      location
    });
  };

  const resolvedVariant = variant ?? (isTracked ? 'secondary' : 'outline');

  if (iconOnly) {
    const label = isTracked ? LABELS.active : LABELS.idle;
    return (
      <Button
        type="button"
        size="icon"
        variant={resolvedVariant}
        className={cn(
          'h-9 w-9 shrink-0 rounded-full',
          isTracked && 'bg-success-subtle text-success hover:ring-1 hover:ring-success/30',
          className
        )}
        onClick={handleClick}
        aria-pressed={isTracked}
        aria-label={label}
        title={label}
      >
        {isTracked ? <BookmarkCheck className="h-4 w-4" aria-hidden /> : <Bookmark className="h-4 w-4" aria-hidden />}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size={size}
      variant={resolvedVariant}
      className={cn(
        'w-full rounded-xl font-semibold',
        isTracked && 'bg-success-subtle text-success hover:ring-1 hover:ring-success/30',
        className
      )}
      onClick={handleClick}
      aria-pressed={isTracked}
    >
      {isTracked ? LABELS.active : LABELS.idle}
    </Button>
  );
};
