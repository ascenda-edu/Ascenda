import { Skeleton } from '@/components/ui/skeleton';

export default function DeadlinesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 rounded-2xl" />
      <Skeleton className="h-14 rounded-2xl" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-32 rounded-2xl" />
      ))}
    </div>
  );
}
