// Pure portal-path helpers for the chat surfaces. Kept free of JSX/component
// imports so tests and server code can use them without dragging in the
// react-markdown ESM pipeline.

import type { ChatMode } from './prompts';

export const ASSISTANT_PATHS: Record<ChatMode, string> = {
  student: '/assistant',
  counsellor: '/counsellor/assistant',
  parent: '/parent/assistant',
};

export function assistantPathForMode(mode: ChatMode): string {
  return ASSISTANT_PATHS[mode];
}

/** True on any of the three Assistant workspace routes (all portals). */
export function isAssistantRoute(pathname: string): boolean {
  return Object.values(ASSISTANT_PATHS).some(
    (p) => pathname === p || pathname.startsWith(p + '/')
  );
}

export function detectMode(pathname: string): ChatMode {
  if (pathname.startsWith('/counsellor')) return 'counsellor';
  if (pathname.startsWith('/parent')) return 'parent';
  return 'student';
}

/**
 * The chat is section-scoped: it must never link a user out of the portal
 * it's running in. Counsellor mode may only link under /counsellor, parent
 * mode under /parent, and student mode anywhere else (the student app).
 */
export function isRouteInMode(route: string, mode: ChatMode): boolean {
  const inCounsellor = route === '/counsellor' || route.startsWith('/counsellor/');
  const inParent = route === '/parent' || route.startsWith('/parent/');
  if (mode === 'counsellor') return inCounsellor;
  if (mode === 'parent') return inParent;
  return !inCounsellor && !inParent && !route.startsWith('/admin');
}
