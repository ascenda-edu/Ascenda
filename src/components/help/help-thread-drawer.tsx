'use client';

import dynamic from 'next/dynamic';

/**
 * Lazy boundary for the help drawer.
 *
 * `HelpDrawerProvider` is mounted in `app/providers.tsx`, i.e. the ROOT layout,
 * so whatever this module pulls in ships in the critical bundle of every route
 * in the app. The drawer's 900-line body now (correctly) depends on
 * `ui/dialog.tsx` → `@radix-ui/react-dialog` + `react-remove-scroll` +
 * `aria-hidden` + focus-scope, which measured **+27 kB gzip** on `/dashboard`,
 * `/matches`, `/profile` and `/inbox` and blew four bundle budgets — for a panel
 * that starts closed and most sessions never open.
 *
 * Same treatment as `chat/chatbot-widget-lazy.tsx`: a separate chunk fetched
 * after hydration. `ssr: false` is legal here because this file is a Client
 * Component (it is forbidden in Server Components — see CLAUDE.md).
 *
 * NOTE for tests and for anyone importing this: the behaviour lives in
 * `./help-thread-drawer-impl`. Import THAT directly when you want it
 * synchronously; import this one when you want the lazy boundary.
 */
export const HelpThreadDrawer = dynamic(
    () => import('./help-thread-drawer-impl').then((mod) => mod.HelpThreadDrawer),
    { ssr: false }
);
