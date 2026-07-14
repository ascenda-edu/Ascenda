import { Skeleton } from '@/components/ui/skeleton';

export default function OutcomesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 rounded-2xl" />
      {/* Summary stat tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
      {/* Acceptance rate + tier cards */}
      <Skeleton className="h-24 rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-2xl" />
        ))}
      </div>
      {/* Results table */}
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
