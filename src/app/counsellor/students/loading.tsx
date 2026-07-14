import { Skeleton } from '@/components/ui/skeleton';

export default function StudentsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 rounded-2xl" />
      {/* Search bar */}
      <Skeleton className="h-14 rounded-2xl" />
      {/* Card grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <Skeleton key={i} className="h-52 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
