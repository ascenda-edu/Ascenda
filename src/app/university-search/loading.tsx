import { Skeleton } from '@/components/ui/skeleton';
import { UniversityCardSkeleton } from '@/components/university-card-skeleton';

export default function SearchLoading() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-64" />
      </div>

      <div className="panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-11 w-full sm:w-[420px]" />
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-28 rounded-xl" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {[1, 2, 3].map((value) => (
            <Skeleton key={value} className="h-9 w-20 rounded-xl" />
          ))}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <UniversityCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
