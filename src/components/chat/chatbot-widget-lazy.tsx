'use client';

import dynamic from 'next/dynamic';

// The chatbot (548 lines + react-markdown + its remark pipeline) was statically
// imported by the shared shell, shipping in every page's critical bundle even
// though the widget starts closed. Load it as its own chunk after hydration.
export const ChatbotWidgetLazy = dynamic(
  () => import('./chatbot-widget').then((mod) => mod.ChatbotWidget),
  { ssr: false }
);
