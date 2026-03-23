export function GoalsListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-28 rounded-[24px] bg-muted/50 animate-pulse border border-border/40"
        />
      ))}
    </div>
  );
}

export function DashboardStatsSkeleton() {
  return (
    <div className="mx-6 p-6 rounded-[24px] bg-card border border-border mb-8">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="text-center">
            <div className="w-10 h-10 mx-auto rounded-2xl bg-muted/70 animate-pulse mb-2" />
            <div className="h-8 max-w-[4rem] mx-auto bg-muted/70 animate-pulse rounded-md mb-2" />
            <div className="h-3 max-w-[3.5rem] mx-auto bg-muted/50 animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PulseListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-24 rounded-[20px] bg-muted/50 animate-pulse border border-border/40" />
      ))}
    </div>
  );
}

export function FriendsPageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-40 rounded-[20px] bg-muted/50 animate-pulse border border-border/40" />
      <div className="h-36 rounded-[20px] bg-muted/50 animate-pulse border border-border/40" />
      {[0, 1].map((i) => (
        <div key={i} className="h-24 rounded-[20px] bg-muted/40 animate-pulse border border-border/40" />
      ))}
    </div>
  );
}
