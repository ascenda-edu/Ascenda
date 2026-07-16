import { Skeleton } from '@/components/ui/skeleton';

export default function AssistantLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-16 rounded-[24px]" />
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <Skeleton className="hidden h-[560px] rounded-[24px] lg:block" />
        <Skeleton className="h-[560px] rounded-[24px]" />
      </div>
    </div>
  );
}
