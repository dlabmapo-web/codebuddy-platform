import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * Browser chrome around a product shot. Square-on: no tilt, no perspective, no
 * device mockup. The product is the argument here, and a 3D treatment costs
 * legibility to buy the look of every other SaaS page.
 *
 * Pass `src` once real 2x captures exist. Until then `children` renders the
 * built-in mock, which is drawn from Cove Studio's own tokens rather than from
 * grey placeholder bars.
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
          studio.coveedu.com
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

/* Shared bits for the mocks below. All decorative — the figure carries the label. */
function Bar({ w, tone = "dim" }: { w: string; tone?: "dim" | "bright" }) {
  return (
    <span
      className={cn(
        "block h-2 rounded-full",
        tone === "bright" ? "bg-white/25" : "bg-white/10",
      )}
      style={{ width: w }}
    />
  );
}

/**
 * The student's screen: problem on the left, editor in the middle, result on
 * the right. Colours are Cove Studio's real ones — `#1E1E1E` is the editor
 * surface the product ships, and the blue is `--brand`.
 */
export function StudentMock() {
  return (
    <div className="grid grid-cols-12 text-[11px] leading-relaxed">
      {/* Problem */}
      <div className="col-span-4 space-y-3 border-r border-white/10 p-5">
        <span className="font-display inline-block rounded bg-cove-teal/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-cove-teal">
          Chapter 3
        </span>
        <p className="text-[13px] font-semibold text-white/85">
          리스트에서 가장 큰 수 찾기
        </p>
        <div className="space-y-2 pt-1">
          <Bar w="100%" />
          <Bar w="92%" />
          <Bar w="97%" />
          <Bar w="64%" />
        </div>
        <div className="rounded border border-white/10 bg-white/[0.03] p-3 space-y-2">
          <Bar w="45%" tone="bright" />
          <Bar w="80%" />
          <Bar w="70%" />
        </div>
      </div>

      {/* Editor */}
      <div className="col-span-5 bg-[#1e1e1e] p-5 font-mono">
        <pre className="text-[11px] leading-[1.9] text-white/80">
          <code>
            <span className="text-white/25">1 </span>
            <span className="text-[#569cd6]">def</span>{" "}
            <span className="text-[#dcdcaa]">largest</span>
            <span className="text-white/60">(nums):</span>
            {"\n"}
            <span className="text-white/25">2 </span>
            {"    "}
            <span className="text-[#569cd6]">best</span>{" "}
            <span className="text-white/60">= nums[</span>
            <span className="text-[#b5cea8]">0</span>
            <span className="text-white/60">]</span>
            {"\n"}
            <span className="text-white/25">3 </span>
            {"    "}
            <span className="text-[#c586c0]">for</span>{" "}
            <span className="text-white/80">n</span>{" "}
            <span className="text-[#c586c0]">in</span>{" "}
            <span className="text-white/80">nums:</span>
            {"\n"}
            <span className="text-white/25">4 </span>
            {"        "}
            <span className="text-[#c586c0]">if</span>{" "}
            <span className="text-white/80">n {">"} best:</span>
            {"\n"}
            <span className="text-white/25">5 </span>
            {"            "}
            <span className="text-white/80">best = n</span>
            {"\n"}
            <span className="text-white/25">6 </span>
            {"    "}
            <span className="text-[#c586c0]">return</span>{" "}
            <span className="text-white/80">best</span>
            <span className="ml-0.5 inline-block h-3.5 w-0.5 translate-y-0.5 bg-cove-blue" />
          </code>
        </pre>
      </div>

      {/* Result */}
      <div className="col-span-3 space-y-3 border-l border-white/10 p-5">
        <p className="font-display text-[10px] font-semibold uppercase tracking-[0.12em] text-white/40">
          Result
        </p>
        <div className="rounded border border-cove-teal/30 bg-cove-teal/10 p-3">
          <p className="font-display text-[13px] font-bold text-cove-teal">
            3 / 3 통과
          </p>
        </div>
        {["입력 1", "입력 2", "입력 3"].map((label) => (
          <div key={label} className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-cove-teal" />
            <span className="text-white/45">{label}</span>
          </div>
        ))}
      </div>
    </div>
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
