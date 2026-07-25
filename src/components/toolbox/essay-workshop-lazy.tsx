'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Next 15 forbids `ssr: false` in Server Components, so the essay-workshop
// page defers to this client wrapper (same pattern as chatbot-widget-lazy).
export const EssayWorkshopLazy = dynamic(
  () => import('@/components/toolbox/essay-workshop').then((m) => m.EssayWorkshop),
  {
    ssr: false,
    // Shaped like the immersive editor: header bar · block panel · editor · AI panel.
    loading: () => (
      <div className="fixed inset-0 z-50 flex flex-col bg-background text-foreground" aria-busy="true">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 bg-card/80 px-4">
          <Skeleton className="h-6 w-6 rounded-md" />
          <Skeleton className="h-4 w-36" />
          <div className="flex-1" />
          <Skeleton className="h-7 w-24 rounded-full" />
          <Skeleton className="h-7 w-7 rounded-md" />
        </div>
        {/* Body: blocks · editor · AI */}
        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-64 shrink-0 flex-col gap-3 border-r border-border/50 bg-card/50 p-3 lg:flex xl:w-72">
            <Skeleton className="h-8 w-full rounded-lg" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </aside>
          <main className="flex min-w-0 flex-1 flex-col">
            <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/50 px-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-6 w-6 rounded-md" />
              ))}
              <div className="flex-1" />
              <Skeleton className="h-6 w-16 rounded-md" />
            </div>
            <div className="flex-1 space-y-3 bg-card px-8 py-6">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </main>
          <aside className="hidden w-72 shrink-0 flex-col gap-4 border-l border-border/50 bg-card/50 p-4 lg:flex">
            <Skeleton className="h-8 w-40 rounded-lg" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </aside>
        </div>
      </div>
    ),
  }
);
