export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="font-mono text-[13px] uppercase tracking-[0.12em] text-sub/70">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
