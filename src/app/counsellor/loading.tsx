import { Skeleton } from '@/components/ui/skeleton';

export default function CounsellorLoading() {
  return (
    <div className="space-y-6">
      {/* Hero skeleton — matches the short PageHero surface-card, whose stat tiles
          sit INSIDE it. There used to be a separate 4-tile stats bar here, left over
          from when the overview rendered one; the page hasn't since the stats moved
          into PageHero, so every load shifted the widget grid up by ~120px. */}
      <Skeleton className="h-20 rounded-2xl" />
      {/* At-risk panel + live help requests */}
      <div className="grid gap-6 lg:grid-cols-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
      {/* Widget grid toolbar + widgets (2-col, matching WidgetGrid) */}
      <Skeleton className="h-10 rounded-full" />
      <div className="grid gap-6 md:grid-cols-2">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
      {/* Student roster */}
      <Skeleton className="h-12 rounded-xl" />
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
