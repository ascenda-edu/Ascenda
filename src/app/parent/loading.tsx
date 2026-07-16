import { Skeleton } from '@/components/ui/skeleton';

export default function ParentLoading() {
  return (
    <div className="space-y-6">
      {/* Section nav pills */}
      <Skeleton className="h-12 rounded-xl" />
      {/* Hero skeleton — matches the PageHero surface-card */}
      <Skeleton className="h-44 rounded-2xl" />
      {/* Card grid */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-48 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
