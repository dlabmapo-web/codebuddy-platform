import { BookOpen, FileCode2, Layers, Presentation } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * What a course is made of, drawn where a course is made.
 *
 * The create dialog used to end with one grey sentence saying that the next
 * step was to add modules. That sentence was true and unread — it is the only
 * place a first-time author is told how the four levels nest, and it looked
 * like a disclaimer.
 *
 * So the four levels are drawn instead, each wearing its own hue and its own
 * mark, in the order they are authored. The colours are the identity family
 * (`--course-*`) the catalog already uses, which is the one palette in the
 * product that means *"which thing is this"* rather than *"is this in
 * trouble"* — exactly the job here, where nothing is in trouble and four
 * different kinds of thing need telling apart.
 *
 * Not numbered. The levels nest, and numbering them 01–04 would claim they are
 * a sequence of steps to complete, when a course with two modules and no
 * problems yet is an ordinary Tuesday.
 */
const levels: { icon: LucideIcon; tone: string; key: string }[] = [
  { icon: BookOpen, tone: 'bg-course-a-soft text-course-a', key: 'course' },
  { icon: Layers, tone: 'bg-course-b-soft text-course-b', key: 'module' },
  { icon: Presentation, tone: 'bg-course-c-soft text-course-c', key: 'lecture' },
  { icon: FileCode2, tone: 'bg-course-d-soft text-course-d', key: 'problem' },
];

export function CoursePathPreview({
  labels,
  title,
}: {
  /** One per level, in the order above: course, module, lecture, problem. */
  labels: readonly [string, string, string, string];
  title: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-canvas px-3.5 py-3">
      <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-sub">
        {title}
      </p>
      <ol className="mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-2">
        {levels.map((level, index) => (
          <li className="flex items-center gap-1" key={level.key}>
            <span className="flex items-center gap-1.5 rounded-md bg-card px-2 py-1.5 ring-1 ring-border">
              <span
                aria-hidden
                className={`grid size-5 shrink-0 place-items-center rounded ${level.tone}`}
              >
                <level.icon className="size-3.5" strokeWidth={2.25} />
              </span>
              <span className="text-[13px] font-semibold text-ink">
                {labels[index]}
              </span>
            </span>
            {index < levels.length - 1 ? (
              <span aria-hidden className="px-0.5 text-[13px] text-sub">
                ›
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
