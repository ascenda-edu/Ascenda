import { Skeleton } from '@/components/ui/skeleton';

export default function SearchLoading() {
  return (
    <div className="space-y-8">
      <div className="surface-stage space-y-8 rounded-[28px] p-8">
        <div className="space-y-5">
          <Skeleton className="h-3 w-28" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4 max-w-xl" />
            <Skeleton className="h-4 w-full max-w-2xl" />
          </div>
          <div className="surface-stat space-y-3 rounded-[28px] p-4">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-12 w-full rounded-full" />
            <Skeleton className="h-11 w-full rounded-full" />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[1, 2, 3].map((value) => (
          <Skeleton key={value} className="h-9 w-32 rounded-full" />
        ))}
      </div>

      <div className="surface-card surface-card--static">
        <div className="flex flex-col gap-2 pb-6">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-7 w-80 max-w-full" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="surface-subcard space-y-3 shadow-none">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-2xl" />
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-11 w-full rounded-xl" />
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between border-t border-border pt-6">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-9 w-32 rounded-full" />
        </div>
      </div>
    </div>
  );
}
