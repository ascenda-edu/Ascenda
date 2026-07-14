import { Skeleton } from '@/components/ui/skeleton';

export default function ApplicationsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 rounded-2xl" />
      {/* Platform summary chips */}
      <div className="flex flex-wrap gap-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-14 w-24 rounded-2xl" />
        ))}
      </div>
      {/* Controls */}
      <Skeleton className="h-9 w-64 rounded-full" />
      {/* Kanban columns */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-64 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
