import { Skeleton } from '@/components/ui/skeleton';

export default function StudentDetailLoading() {
  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Skeleton className="h-5 w-56 rounded-full" />
      {/* Header card */}
      <Skeleton className="h-40 rounded-2xl" />
      {/* Tab nav */}
      <Skeleton className="h-14 rounded-2xl" />
      {/* Content grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
