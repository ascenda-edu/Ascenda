import { Skeleton } from '@/components/ui/skeleton';

export default function ParentProgressLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-44 rounded-2xl" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
