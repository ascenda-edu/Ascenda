import { Skeleton } from '@/components/ui/skeleton';

/**
 * `AssistantWorkspace` renders a plain eyebrow / title / subtitle header and a
 * "New chat" button — NOT a `PageHero` — so this deliberately does not use
 * `PageHeroSkeleton`: a hero card here would be the layout shift, not the fix.
 * The panes carry the rail's and ThreadPane's own height expression rather than
 * a guessed 560px.
 */
export default function ParentAssistantLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-5 w-80 max-w-full" />
          </div>
          <Skeleton className="h-9 w-28 shrink-0 rounded-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Skeleton className="hidden h-[calc(100vh-220px)] min-h-[480px] rounded-3xl lg:block" />
          <Skeleton className="h-[calc(100vh-220px)] min-h-[480px] rounded-3xl" />
        </div>
      </div>
    </div>
  );
}
