'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

type ThemeMode = 'light' | 'dark';
type ThemePreference = ThemeMode | 'system';

interface ThemeContextValue {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const STORAGE_KEY = 'ascenda-theme-preference';
const USER_SET_KEY = 'ascenda-theme-user-set';

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreference] = useState<ThemePreference>('system');
  const [mode, setMode] = useState<ThemeMode>('light');
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initialize from storage
    const stored = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    const userSet = localStorage.getItem(USER_SET_KEY) === 'manual';

    // If we have a stored preference and it was manually set, use it.
    // Otherwise, default to system.
    if (stored && userSet) {
      setPreference(stored);
    } else {
      setPreference('system');
    }

    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated || typeof window === 'undefined') return;

    // Only persist if it's a user action (implied by changing preference after hydration)
    // But we need to be careful not to overwrite on initial load if we just set it.
    // Actually, we should always sync state to storage, but manage the USER_SET_KEY carefully.

    localStorage.setItem(STORAGE_KEY, preference);

    // We don't toggle USER_SET_KEY here because we don't know if this change came from 
    // user interaction or initialization. 
    // Instead, we'll handle USER_SET_KEY in the setPreference wrapper or toggleMode.

  }, [hasHydrated, preference]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const resolveSystemMode = () => (mediaQuery.matches ? 'dark' : 'light');
    const updateFromSystem = (event: MediaQueryListEvent) => {
      if (preference === 'system') {
        setMode(event.matches ? 'dark' : 'light');
      }
    };

    if (preference === 'system') {
      setMode(resolveSystemMode());

      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', updateFromSystem);
        return () => mediaQuery.removeEventListener('change', updateFromSystem);
      }
      // Legacy fallback
      else if (mediaQuery.addListener) {
        mediaQuery.addListener(updateFromSystem);
        return () => mediaQuery.removeListener(updateFromSystem);
      }
    } else {
      setMode(preference);
    }
    return undefined;
  }, [preference]);

  useEffect(() => {
    applyDocumentTheme(mode);
  }, [mode]);

  const handleSetPreference = (newPreference: ThemePreference) => {
    setPreference(newPreference);
    // We can safely assume this is a user action if called via context
    if (newPreference === 'system') {
      localStorage.removeItem(USER_SET_KEY);
    } else {
      localStorage.setItem(USER_SET_KEY, 'manual');
    }
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      preference,
      setPreference: handleSetPreference,
      setMode: (nextMode) => handleSetPreference(nextMode),
      toggleMode: () => {
        const next = preference === 'system'
          ? (mode === 'dark' ? 'light' : 'dark')
          : (preference === 'dark' ? 'light' : 'dark');
        handleSetPreference(next);
      }
    }),
    [mode, preference]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useThemeMode = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within a ThemeProvider');
  }
  return context;
};

// Matches the resolved `--background` token (globals.css): light 220 16% 96%,
// dark 224 32% 6%.
const THEME_COLOR: Record<ThemeMode, string> = {
  light: '#f3f4f6',
  dark: '#0a0d14'
};

const applyDocumentTheme = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;

  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', THEME_COLOR[mode]);
};
