import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Browser chrome around a product shot. Square-on: no tilt, no perspective, no
 * device mockup. The product is the argument here, and a 3D treatment costs
 * legibility to buy the look of every other SaaS page.
 *
 * `src` takes a real 2x capture; `children` renders a mock built from Cove
 * Studio's own tokens. The student's screen is a real capture now. The
 * teacher's is still a mock, and deliberately: a live roster is only worth
 * showing with a room full of students in it, and a screenshot of the
 * development database is a room with one.
 */
export function Screenshot({
  src,
  alt,
  children,
  className,
}: {
  src?: string;
  alt: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "overflow-hidden rounded-[12px] border border-white/10 bg-[#0d1117] shadow-[0_24px_60px_-20px_rgba(4,12,32,0.6)]",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="font-display ml-3 truncate rounded-full bg-white/[0.07] px-3 py-1 text-[11px] tracking-wide text-white/40">
          cs.coveedu.com
        </span>
      </div>
      {src ? (
        <Image
          src={src}
          alt={alt}
          width={1600}
          height={1000}
          className="w-full"
          priority
        />
      ) : (
        <div role="img" aria-label={alt}>
          {children}
        </div>
      )}
    </figure>
  );
}

/** The teacher's screen: a live roster, which is the thing they actually watch. */
export function TeacherMock() {
  const rows = [
    { name: "김도윤", state: "solving", pct: "62%" },
    { name: "이서준", state: "done", pct: "100%" },
    { name: "박하은", state: "stuck", pct: "38%" },
    { name: "정민재", state: "done", pct: "100%" },
    { name: "최유나", state: "solving", pct: "71%" },
  ] as const;

  const dot = {
    solving: "bg-cove-blue",
    done: "bg-cove-teal",
    stuck: "bg-cove-coral",
  } as const;

  return (
    <div className="p-5 text-[11px]">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[13px] font-semibold text-white/85">
          파이썬 기초 A반 · 3교시
        </p>
        <span className="font-display flex items-center gap-1.5 rounded-full bg-cove-teal/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-cove-teal">
          <span className="cove-live-dot size-1.5 rounded-full bg-cove-teal" />
          Live
        </span>
      </div>
      <div className="overflow-hidden rounded border border-white/10">
        {rows.map((row, index) => (
          <div
            key={row.name}
            className={cn(
              "flex items-center gap-3 px-4 py-3",
              index % 2 === 1 && "bg-white/[0.02]",
            )}
          >
            <span className={cn("size-2 rounded-full", dot[row.state])} />
            <span className="w-16 text-white/80">{row.name}</span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <span
                className={cn("block h-full rounded-full", dot[row.state])}
                style={{ width: row.pct }}
              />
            </span>
            <span className="tabular w-10 text-right text-white/45">
              {row.pct}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
