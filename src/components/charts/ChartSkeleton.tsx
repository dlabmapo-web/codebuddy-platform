export default function ChartSkeleton() {
  return (
    <div className="animate-pulse rounded-xl bg-[var(--color-surface)]" style={{ height: 260 }}>
      <div className="h-full flex items-end gap-3 px-8 pb-8">
        {[42, 68, 51, 78, 62, 84, 57].map((height, index) => (
          <div
            key={index}
            className="flex-1 rounded-t-md bg-[var(--color-border)]"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>
    </div>
  );
}
