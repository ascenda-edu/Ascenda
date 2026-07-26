'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { HelpThreadDrawer } from './help-thread-drawer';

interface HelpDrawerContextValue {
  openRequest: (id: string) => void;
  closeRequest: () => void;
  currentRequestId: string | null;
}

const HelpDrawerContext = createContext<HelpDrawerContextValue | null>(null);

type HelpDrawerSide = 'counsellor' | 'student';

const sideForPathname = (path: string | null | undefined): HelpDrawerSide =>
  path?.startsWith('/counsellor') ? 'counsellor' : 'student';

export const HelpDrawerProvider = ({ children }: { children: ReactNode }) => {
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null);
  // Side is CAPTURED at open time, not derived live from the pathname. The
  // z-modal overlay blocks in-app nav, but browser Back still changes the
  // route while the drawer stays open on the same thread. If side were
  // derived from the current pathname it would flip 'counsellor' -> 'student'
  // mid-thread, causing useHelpThread's mark-read effect to stamp the wrong
  // party's read receipt (forging the student's 'Seen'), misattribute replies,
  // and hide the counsellor's Accept/Resolve controls. Freezing side to the
  // pathname at the moment the request opened keeps the thread stable.
  const [currentSide, setCurrentSide] = useState<HelpDrawerSide>('student');
  const pathname = usePathname();

  const openRequest = useCallback(
    (id: string) => {
      setCurrentSide(sideForPathname(pathname));
      setCurrentRequestId(id);
    },
    [pathname]
  );
  const closeRequest = useCallback(() => setCurrentRequestId(null), []);

  // Auto-open if URL has ?help=<id>. Doesn't strip the param — leaving it
  // lets the user reload and stay on the same conversation.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('help');
    if (id && id !== currentRequestId) {
      // Capture side from the pathname active when the deep-link opens too.
      setCurrentSide(sideForPathname(pathname));
      setCurrentRequestId(id);
    }
    // No deps on pathname/search because Next's hooks don't refresh on a
    // pure query-string change reliably; we re-check on each pathname change
    // and on hash/search events below.
  }, [pathname, currentRequestId]);

  const value = useMemo(
    () => ({ openRequest, closeRequest, currentRequestId }),
    [openRequest, closeRequest, currentRequestId]
  );

  return (
    <HelpDrawerContext.Provider value={value}>
      {children}
      <HelpThreadDrawer
        open={currentRequestId !== null}
        requestId={currentRequestId}
        side={currentSide}
        onClose={closeRequest}
      />
    </HelpDrawerContext.Provider>
  );
};

export const useHelpDrawer = (): HelpDrawerContextValue => {
  const ctx = useContext(HelpDrawerContext);
  if (!ctx) {
    throw new Error('useHelpDrawer must be used within HelpDrawerProvider');
  }
  return ctx;
};
