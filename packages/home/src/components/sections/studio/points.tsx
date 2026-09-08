import { Reveal } from "@/components/site/reveal";
import { Card } from "@/components/ui/card";
import { CircleCheck } from "@/components/ui/icons";
import { hues, type Hue } from "@/lib/hues";

/**
 * Four claims about one surface, in a responsive card grid.
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
    <ul className="grid gap-4 md:grid-cols-2">
      {points.map((point, index) => (
        <Reveal as="li" key={point.title} delay={index * 70}>
          <Card hue={hue} className="p-6 sm:p-8">
            <h3 className="flex items-start gap-3 text-[16px] font-bold text-ink">
              <CircleCheck
                className={`size-5 shrink-0 ${hues[hue].text}`}
                aria-hidden="true"
              />
              {point.title}
            </h3>
            <p className="mt-4 text-[15px] leading-[1.75] text-sub">
              {point.body}
            </p>
          </Card>
        </Reveal>
      ))}
    </ul>
  );
}
