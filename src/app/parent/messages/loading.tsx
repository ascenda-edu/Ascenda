import { Skeleton } from '@/components/ui/skeleton';

export default function ParentMessagesLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-[480px] rounded-2xl" />
    </div>
  );
}
