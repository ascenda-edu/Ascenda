export default function CounsellorInboxLoading() {
  return (
    <div className="space-y-6">
      <div className="h-24 animate-pulse rounded-[28px] bg-muted/50" />
      <div className="h-10 animate-pulse rounded-2xl bg-muted/50" />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-2xl bg-muted/50" />
      ))}
    </div>
  );
}
