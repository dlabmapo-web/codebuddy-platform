import { Lightbulb, Plus, Trash2 } from 'lucide-react';

import { useLayoutTranslation } from '@/i18n';

import {
  newClientKey,
  replaceAt,
  type HintDraft,
} from '../_lib/exercise-draft';
import {
  inputClass,
  secondaryButtonClass,
  SectionCard,
} from './authoring-fields';

export function HintsEditor({
  editable,
  hints,
  update,
}: {
  editable: boolean;
  hints: HintDraft[];
  update: (hints: HintDraft[]) => void;
}) {
  const { t } = useLayoutTranslation('content');

  return (
    <SectionCard
      action={
        editable ? (
          <button
            className={secondaryButtonClass}
            onClick={() =>
              update([
                ...hints,
                {
                  key: newClientKey(),
                  content: '',
                  triggerExpression: '',
                },
              ])
            }
            type="button"
          >
            <Plus className="size-4" />
            {t('exercise.hint.add')}
          </button>
        ) : null
      }
      description={t('exercise.hint.help')}
      icon={Lightbulb}
      title={t('exercise.section.hints')}
    >
      {hints.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <Lightbulb className="mx-auto size-6 text-sub" />
          <p className="mt-2 text-[14px] text-sub">
            {t('exercise.hint.empty')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {hints.map((hint, index) => (
            <article
              className="rounded-xl border border-border bg-canvas p-4"
              key={hint.key}
            >
              <header className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-[14.5px] font-extrabold">
                  {t('exercise.hint.label', { number: index + 1 })}
                </h3>
                {editable ? (
                  <button
                    aria-label={t('exercise.hint.remove', {
                      number: index + 1,
                    })}
                    className="grid size-8 place-items-center rounded-lg text-danger hover:bg-danger/10"
                    onClick={() =>
                      update(
                        hints.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    type="button"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </header>
              <textarea
                aria-label={t('exercise.hint.content')}
                className={`${inputClass} min-h-28 resize-y py-2.5`}
                disabled={!editable}
                maxLength={10_000}
                onChange={(event) =>
                  update(
                    replaceAt(hints, index, {
                      ...hint,
                      content: event.target.value,
                    }),
                  )
                }
                value={hint.content}
              />
            </article>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
