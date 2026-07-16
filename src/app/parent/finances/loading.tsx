import { Skeleton } from '@/components/ui/skeleton';

export default function ParentFinancesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-16 rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-56 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
