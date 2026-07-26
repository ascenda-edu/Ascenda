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
          'h-9 w-9 rounded-full border border-border/60 bg-card/80 text-foreground shadow-e-1 transition-colors hover:border-primary/40 hover:bg-muted/60',
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
        'flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-2 shadow-e-1',
        className
      )}
    >
      <div className="inline-flex items-center gap-1 rounded-full bg-background/60 p-1">
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
