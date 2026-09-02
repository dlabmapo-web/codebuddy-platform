'use client';

import type { ContentLens } from '@cove/shared';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLayoutTranslation } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';

import {
  AcademyField,
  type ConsoleAcademyOption,
} from '../../_components/academy-field';
import { contentDetailHref } from '../../_lib/content-view';

/**
 * What the modal is about to write.
 *
 * `create` carries no academy of its own: the table decides whether the facet
 * has already answered that question, and hands the answer down as
 * `lockedAcademyId`. `edit` carries one, because the record already belongs
 * somewhere and that cannot be changed here — there is no endpoint that moves
 * a course between academies, and a picker offering one would be a control
 * that fails on submit.
 */
export type ContentRecordDraft =
  | { mode: 'create' }
  | {
      mode: 'edit';
      academyId: string;
      id: string;
      title: string;
      description: string;
      /**
       * The row's `updatedAt`, for the class endpoint's optimistic check.
       *
       * A class carries a roster and a schedule, and `academyClasses.update`
       * refuses a write built on a version somebody has since changed. The
       * table hands over the stamp it rendered, so the refusal happens on the
       * server rather than silently overwriting a manager's edit.
       */
      updatedAt: string;
    };

/**
 * Naming a course or a class, from a table that spans every academy.
 *
 * The studio has two of these already — `CourseModal` and `ClassModal` — and
 * they are the same form twice: a name, an optional description, one confirm.
 * This is that form with **one field prepended**, because the studio's version
 * can leave the academy implicit and the console cannot.
 *
 * One component for both kinds rather than two, for the reason `ContentTable`
 * is one component for both pages: they differ in which endpoint they call and
 * which words they print, and nothing else. The copy comes from the studio's
 * own `courses` and `classes` namespaces, so an operator and a manager are read
 * the same sentence about the same act.
 *
 * ## The academy field
 *
 * Drawn as a form control — a solid bordered field the height of the inputs
 * below it — and deliberately *not* as the dashed facet chip the toolbar uses.
 * The chip narrows a list you are looking at; this decides where a new record
 * lands. Two controls that look alike and do different things is how an
 * operator ends up creating a customer's course in the wrong academy.
 *
 * It has no default. When the facet is already narrowed to one academy the
 * table passes it as `lockedAcademyId` and the field states it as settled
 * fact — the operator answered this when they set the filter. When the facet
 * is wide, the field starts empty and the form cannot be submitted until it is
 * answered.
 */
export function ContentRecordModal({
  academies,
  draft,
  from,
  kind,
  lockedAcademyId,
  onClose,
  onSaved,
}: {
  academies: ConsoleAcademyOption[];
  draft: ContentRecordDraft | null;
  /** This table's address, so the new record's editor can find its way back. */
  from: string;
  kind: ContentLens;
  /** Set when the academy facet holds exactly one academy. */
  lockedAcademyId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation('platform');
  const { t: copy } = useLayoutTranslation(['courses', 'classes', 'common']);
  const errorText = useErrorText();
  const router = useRouter();

  const editing = draft?.mode === 'edit';
  const ns = kind === 'courses' ? 'courses' : 'classes';

  const [academyId, setAcademyId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);

  // Reset from the draft each time one arrives, keyed by identity rather than
  // by an effect: a modal that keeps the last record's name in the box is one
  // stray click away from renaming the wrong thing.
  const [seen, setSeen] = React.useState<ContentRecordDraft | null>(null);
  if (draft !== seen) {
    setSeen(draft);
    setError(null);
    setTitle(draft?.mode === 'edit' ? draft.title : '');
    setDescription(draft?.mode === 'edit' ? draft.description : '');
    setAcademyId(draft?.mode === 'edit' ? draft.academyId : lockedAcademyId);
  }

  const chosen = academies.find((academy) => academy.id === academyId) ?? null;
  const ready = title.trim().length > 0 && Boolean(chosen);
  const locked = editing || Boolean(lockedAcademyId);

  const close = () => {
    if (busy) return;
    onClose();
  };

  const submit = async () => {
    if (!draft || !chosen || !ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (draft.mode === 'edit') {
        if (kind === 'courses') {
          await orpc.academyCourses.update({
            academyId: draft.academyId,
            courseId: draft.id,
            title: title.trim(),
            description: description.trim(),
          });
        } else {
          await orpc.academyClasses.update({
            academyId: draft.academyId,
            classId: draft.id,
            expectedUpdatedAt: draft.updatedAt,
            name: title.trim(),
            description: description.trim(),
          });
        }
        onSaved();
        return;
      }

      // Straight into the new record's editor, as the studio does. It is also
      // the check on the one mistake this form can make: the academy's name is
      // in the header of the page that opens, a second after the choice.
      if (kind === 'courses') {
        const course = await orpc.academyCourses.create({
          academyId: chosen.id,
          title: title.trim(),
          description: description.trim(),
        });
        onSaved();
        router.push(
          contentDetailHref.course(
            { academySlug: chosen.slug, id: course.id },
            from,
          ),
        );
      } else {
        const created = await orpc.academyClasses.create({
          academyId: chosen.id,
          name: title.trim(),
          description: description.trim(),
        });
        onSaved();
        router.push(
          contentDetailHref.class(
            { academySlug: chosen.slug, id: created.id },
            from,
          ),
        );
      }
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const nameLabel =
    kind === 'courses'
      ? copy('courses:create.title_label')
      : copy('classes:create.name_label');
  const namePlaceholder =
    kind === 'courses'
      ? copy('courses:create.title_placeholder')
      : copy('classes:create.name_placeholder');
  const failure =
    kind === 'courses'
      ? copy('courses:create.title_conflict')
      : copy(editing ? 'classes:edit_modal.failed' : 'classes:create.failed');

  return (
    <Modal onOpenChange={(next) => (next ? null : close())} open={Boolean(draft)}>
      <ModalContent
        description={copy(
          editing ? `${ns}:edit_modal.body` : `${ns}:create.body`,
        )}
        title={copy(
          editing ? `${ns}:edit_modal.heading` : `${ns}:create.heading`,
        )}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-4 px-6 py-5">
            <div className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {t('academy_field.label')}
                {locked ? null : <span className="ml-1 text-danger">*</span>}
              </span>
              <AcademyField
                academies={academies}
                locked={locked}
                onChange={setAcademyId}
                selected={chosen}
              />
              {locked && !editing ? (
                <span className="text-[12.5px] text-sub">
                  {t('academy_field.locked')}
                </span>
              ) : null}
            </div>

            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {nameLabel}
                <span className="ml-1 text-danger">*</span>
              </span>
              <input
                autoFocus={locked}
                className="h-11 w-full rounded-lg border border-border bg-card px-3 text-[15px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={kind === 'courses' ? 200 : 120}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={namePlaceholder}
                value={title}
              />
            </label>

            <label className="grid gap-1.5">
              <span className="text-[14px] font-bold">
                {copy(`${ns}:create.description_label`)}{' '}
                <span className="font-normal text-sub">
                  {copy(`${ns}:create.description_optional`)}
                </span>
              </span>
              <textarea
                className="min-h-24 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-[15px] leading-6 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                maxLength={kind === 'courses' ? 10_000 : 2_000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={copy(`${ns}:create.description_placeholder`)}
                value={description}
              />
            </label>

            {editing ? null : (
              <p className="rounded-lg bg-canvas px-3.5 py-2.5 text-[13.5px] leading-5 text-sub">
                {copy(`${ns}:create.next_step`)}
              </p>
            )}

            {error ? (
              <p
                className="rounded-lg bg-danger/5 px-3.5 py-2.5 text-[14px] font-semibold text-danger"
                role="alert"
              >
                {errorText(error, failure)}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
            <button
              className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas"
              onClick={close}
              type="button"
            >
              {copy('common:action.cancel')}
            </button>
            <button
              className="h-11 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={!ready || busy}
              type="submit"
            >
              {busy
                ? copy(`${ns}:create.submitting`)
                : copy(editing ? `${ns}:edit_modal.submit` : `${ns}:create.submit`)}
            </button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
