import { Skeleton } from '@/components/ui/skeleton';

export default function DocumentsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 rounded-2xl" />
      {/* Filter / toolbar row */}
      <Skeleton className="h-12 rounded-2xl" />
      {/* Document rows */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className="h-16 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
