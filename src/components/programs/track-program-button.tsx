'use client';

import { useMemo } from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useShortlist } from '@/components/university-search/shortlist-store';
import { cn } from '@/lib/utils';
import { ACTION_TEXT } from '@/lib/constants/text';

export type TrackLabelVariant = 'shortlist' | 'planner';

const LABELS: Record<TrackLabelVariant, { idle: string; active: string }> = {
  shortlist: {
    idle: ACTION_TEXT.shortlist,
    active: ACTION_TEXT.shortlisted
  },
  planner: {
    idle: ACTION_TEXT.saveToPlanner,
    active: ACTION_TEXT.savedToPlanner
  }
};

type TrackProgramButtonProps = {
  programId: string;
  programName: string;
  universityName: string;
  location?: string;
  fitScore?: number | null;
  labelVariant?: TrackLabelVariant;
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
  labelVariant = 'shortlist',
  size = 'sm',
  variant,
  className,
  iconOnly = false
}: TrackProgramButtonProps) => {
  const { items, addItem, removeItem } = useShortlist();
  const labels = useMemo(() => LABELS[labelVariant], [labelVariant]);
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
    const label = isTracked ? labels.active : labels.idle;
    return (
      <Button
        type="button"
        size="icon"
        variant={resolvedVariant}
        className={cn(
          'h-9 w-9 shrink-0 rounded-full',
          isTracked &&
            'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25',
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
        isTracked &&
          'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:hover:bg-emerald-500/25',
        className
      )}
      onClick={handleClick}
      aria-pressed={isTracked}
    >
      {isTracked ? labels.active : labels.idle}
    </Button>
  );
};
