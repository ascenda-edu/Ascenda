import { Skeleton } from '@/components/ui/skeleton';

export default function UniversitiesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 rounded-2xl" />
      {/* Search catalogue (left) + deck library (right) */}
      <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
        <div className="space-y-3">
          <Skeleton className="h-12 rounded-2xl" />
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 rounded-2xl" />
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-10 rounded-2xl" />
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
