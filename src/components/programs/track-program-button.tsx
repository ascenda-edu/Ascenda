'use client';

import { useMemo } from 'react';
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
  className
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
