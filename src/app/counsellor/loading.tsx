import { Skeleton } from '@/components/ui/skeleton';

export default function CounsellorLoading() {
  return (
    <div className="space-y-6">
      {/* Hero skeleton — matches the short PageHero surface-card */}
      <Skeleton className="h-20 rounded-2xl" />
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      {/* Widget grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
