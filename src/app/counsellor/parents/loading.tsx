import { Skeleton } from '@/components/ui/skeleton';

export default function ParentsLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-20 rounded-2xl" />
      {/* Portal: contact directory + message thread */}
      <div className="grid gap-4 lg:grid-cols-[320px,1fr]">
        <Skeleton className="h-[560px] rounded-2xl" />
        <Skeleton className="h-[560px] rounded-2xl" />
      </div>
    </div>
  );
}
