'use client';

import { Laptop, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useThemeMode } from './theme-provider';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  compact?: boolean;
  className?: string;
}

export const ThemeToggle = ({ compact = false, className }: ThemeToggleProps) => {
  const { mode, preference, setPreference, setMode, toggleMode } = useThemeMode();

  if (compact) {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn(
          'h-9 w-9 rounded-full border border-border bg-card text-foreground shadow-e-1 transition-colors hover:border-primary/30 hover:bg-muted',
          className
        )}
        onClick={toggleMode}
        aria-label={
          preference === 'system'
            ? `Following system (${mode}). Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`
            : `Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`
        }
        title={preference === 'system' ? `System ${mode} mode` : `${mode} mode`}
      >
        {mode === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-e-1',
        className
      )}
    >
      {/* gap-2, was gap-1: three ~36px segments 4px apart is inside the mis-tap
          band on touch, and System/Light/Dark are mutually exclusive so a
          mis-tap is always wrong rather than merely extra. */}
      <div className="inline-flex items-center gap-2 rounded-full bg-background p-1">
        <Button
          type="button"
          size="sm"
          variant={preference === 'system' ? 'default' : 'ghost'}
          className="gap-1 px-3"
          onClick={() => setPreference('system')}
          aria-pressed={preference === 'system'}
        >
          <Laptop className="h-4 w-4" />
          System
        </Button>
        <Button
          type="button"
          size="sm"
          variant={preference === 'light' ? 'default' : 'ghost'}
          className="gap-1 px-3"
          onClick={() => setMode('light')}
          aria-pressed={preference === 'light'}
        >
          <Sun className="h-4 w-4" />
          Light
        </Button>
        <Button
          type="button"
          size="sm"
          variant={preference === 'dark' ? 'default' : 'ghost'}
          className="gap-1 px-3"
          onClick={() => setMode('dark')}
          aria-pressed={preference === 'dark'}
        >
          <Moon className="h-4 w-4" />
          Dark
        </Button>
      </div>
    </div>
  );
};
