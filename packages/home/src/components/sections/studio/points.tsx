import { Reveal } from "@/components/site/reveal";
import { hues, type Hue } from "@/lib/hues";

/**
 * Four claims about one surface, as a hairline-separated list.
 *
 * Shared by the student and teacher sections rather than owned by either. They
 * make the same shape of argument, and a second copy is how the two would
 * start drifting in spacing and weight.
 */
export function Points({
  points,
  hue,
}: {
  points: { title: string; body: string }[];
  hue: Hue;
}) {
  return (
    <ul className="border-t border-line">
      {points.map((point, index) => (
        <Reveal
          as="li"
          key={point.title}
          delay={index * 70}
          className="grid gap-2 border-b border-line py-6 sm:grid-cols-[minmax(0,15rem)_1fr] sm:gap-8"
        >
          <h3 className="flex items-start gap-3 text-[16px] font-bold text-ink">
            <span
              className={`mt-2.5 size-1.5 shrink-0 rounded-full ${hues[hue].bar}`}
              aria-hidden="true"
            />
            {point.title}
          </h3>
          <p className="text-[15px] leading-[1.75] text-sub sm:pt-0.5">
            {point.body}
          </p>
        </Reveal>
      ))}
    </ul>
  );
}
