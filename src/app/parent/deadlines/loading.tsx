import { Skeleton } from '@/components/ui/skeleton';

export default function ParentDeadlinesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-44 rounded-2xl" />
      {[1, 2].map((i) => (
        <Skeleton key={i} className="h-40 rounded-2xl" />
      ))}
    </div>
  );
}
