/* eslint-disable i18next/no-literal-string -- This component renders a Python source-code sample. */

/** Decorative editor mockup for the brand panel — pure presentation, no interaction. */
export function CodePreview() {
  return (
    <div className="overflow-hidden rounded-xl border border-white/12 bg-editor-bg shadow-2xl shadow-black/20">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-[#FF5F57]" />
        <span className="h-3 w-3 rounded-full bg-[#FEBC2E]" />
        <span className="h-3 w-3 rounded-full bg-[#28C840]" />
        <span className="ml-2 font-mono text-[12px] text-white/40">solution.py</span>
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-7">
        <code>
          <span className="text-[#569CD6]">def</span> <span className="text-[#DCDCAA]">two_sum</span>
          <span className="text-[#D4D4D4]">(nums, target):</span>
          {'\n'}
          {'    '}
          <span className="text-[#9CDCFE]">seen</span>
          <span className="text-[#D4D4D4]"> = {'{}'}</span>
          {'\n'}
          {'    '}
          <span className="text-[#C586C0]">for</span>
          <span className="text-[#D4D4D4]"> i, num </span>
          <span className="text-[#C586C0]">in</span>
          <span className="text-[#DCDCAA]"> enumerate</span>
          <span className="text-[#D4D4D4]">(nums):</span>
          {'\n'}
          {'        '}
          <span className="text-[#D4D4D4]">comp = target - num</span>
          {'\n'}
          {'        '}
          <span className="text-[#C586C0]">if</span>
          <span className="text-[#D4D4D4]"> comp </span>
          <span className="text-[#C586C0]">in</span>
          <span className="text-[#D4D4D4]"> seen:</span>
          {'\n'}
          {'            '}
          <span className="text-[#C586C0]">return</span>
          <span className="text-[#D4D4D4]"> [seen[comp], i]</span>
        </code>
      </pre>
    </div>
  );
}
