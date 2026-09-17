'use client';

import { AlertTriangle, ChevronRight, Eye, EyeOff, Search } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Modal, ModalContent } from '@/components/studio/primitives';
import { useErrorText } from '@/i18n/client/use-error-text';

import type { CourseBuilderState } from '../_hooks/use-course-builder';
import {
  destinationCount,
  filterDestinations,
  locateItem,
  MOVE_SEARCH_THRESHOLD,
  moveDestinations,
  moduleOfParent,
  positionOptions,
  visibilityAfterMove,
  type MoveKind,
  type PositionOption,
} from '../_lib/course-tree';

/**
 * Choose where a lecture or problem goes, anywhere in its course.
 *
 * Two questions, asked in the order an author thinks them: *which* lecture (or
 * chapter), then *where in it*. The current place starts selected, so opening
 * the dialog commits to nothing and a plain reorder costs no more than it did
 * when this dialog only listed siblings. A sentence under both questions says
 * exactly what pressing the button will do, and nothing moves until it is
 * pressed.
 *
 * Mounted only while open, so every opening starts from the item's current
 * place rather than from the last choice.
 */
export function MoveAnywhereModal({
  builder,
  itemId,
  kind,
  onClose,
  visibilityIsReal,
}: {
  builder: CourseBuilderState;
  itemId: string;
  kind: MoveKind;
  onClose: () => void;
  /** False in a library academy, which has no students to hide anything from. */
  visibilityIsReal: boolean;
}) {
  const { t } = useTranslation(['content', 'common']);
  const errorText = useErrorText();
  const headingId = useId();
  const positionHeadingId = useId();
  const tree = builder.tree;

  const location = locateItem(tree, kind, itemId);
  const [parentId, setParentId] = useState(location?.parentId ?? '');
  const [index, setIndex] = useState(location?.index ?? 0);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => {
    const currentModule = location ? moduleOfParent(tree, kind, location.parentId) : undefined;
    return new Set(currentModule ? [currentModule.id] : []);
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const groups = moveDestinations(tree, kind, itemId);
  const searchable = destinationCount(groups) > MOVE_SEARCH_THRESHOLD;
  const shown = filterDestinations(groups, query);
  const { options } = positionOptions(tree, kind, itemId, parentId);
  const chosen = options.find((option) => option.index === index) ?? options[options.length - 1];
  const unchanged = !location || (location.parentId === parentId && location.index === index);
  const visibility = visibilityIsReal
    ? visibilityAfterMove(tree, kind, itemId, parentId)
    : null;
  const destination = describeDestination(tree, kind, parentId);
  const movedContents =
    kind === 'lecture'
      ? tree.modules.flatMap((item) => item.lectures).find((item) => item.id === itemId)
          ?.materials.length ?? 0
      : 0;

  if (!location) return null;

  const choose = (nextParentId: string) => {
    setParentId(nextParentId);
    setIndex(positionOptions(tree, kind, itemId, nextParentId).defaultIndex);
    setError(null);
  };

  const confirm = async () => {
    if (unchanged || pending) return;
    setPending(true);
    setError(null);
    try {
      await builder.move(kind, itemId, { parentId, index });
      onClose();
    } catch (caught) {
      setError(caught);
      setPending(false);
    }
  };

  const toggleGroup = (groupId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });

  return (
    <Modal
      onOpenChange={(next) => {
        // A move in flight cannot be walked away from: its result is about to
        // replace the outline behind this dialog.
        if (!next && !pending) onClose();
      }}
      open
    >
      <ModalContent
        className="max-w-xl"
        description={location.title}
        title={t(`move.${kind}_title`)}
      >
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void confirm();
          }}
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <section>
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[14.5px] font-bold" id={headingId}>
                  <StepNumber>1</StepNumber>
                  {t(kind === 'lecture' ? 'move.step_module' : 'move.step_lecture')}
                </h3>
                {searchable ? (
                  <label className="relative block w-full sm:w-52">
                    <span className="sr-only">
                      {t(kind === 'lecture' ? 'move.search_module' : 'move.search_lecture')}
                    </span>
                    <Search
                      aria-hidden
                      className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-sub"
                    />
                    <input
                      className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-[14px] outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/20"
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t(
                        kind === 'lecture' ? 'move.search_module' : 'move.search_lecture',
                      )}
                      type="search"
                      value={query}
                    />
                  </label>
                ) : null}
              </div>

              <div
                aria-labelledby={headingId}
                className="max-h-[17rem] overflow-y-auto rounded-lg border border-border"
                role="radiogroup"
              >
                {shown.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[14px] text-sub">
                    {t('move.no_results')}
                  </p>
                ) : null}
                {shown.map((group) => {
                  // A lecture's destinations are the chapters of one course:
                  // a heading repeating the course title would say nothing.
                  const grouped = kind === 'exercise';
                  const open = !grouped || query.trim() !== '' || expanded.has(group.id);
                  return (
                    <div className="border-b border-border last:border-b-0" key={group.id}>
                      {grouped ? (
                        <button
                          aria-expanded={open}
                          className="flex w-full items-center gap-2 bg-canvas px-3 py-2 text-left text-[13.5px] font-bold text-ink transition-colors hover:bg-brand-soft/40"
                          onClick={() => toggleGroup(group.id)}
                          type="button"
                        >
                          <ChevronRight
                            aria-hidden
                            className={`size-3.5 shrink-0 text-sub transition-transform duration-150 ${
                              open ? 'rotate-90' : ''
                            }`}
                          />
                          <span className="min-w-0 flex-1 truncate">{group.title}</span>
                          <span className="shrink-0 text-[12.5px] font-semibold text-sub">
                            {t('module.lecture_count', { count: group.parents.length })}
                          </span>
                          {visibilityIsReal && group.hidden ? <HiddenMark /> : null}
                        </button>
                      ) : null}
                      {open ? (
                        <ul>
                          {group.parents.map((parent) => (
                            <li key={parent.id}>
                              <label
                                className={`flex cursor-pointer items-center gap-3 py-2.5 pr-3 transition-colors hover:bg-canvas has-[:checked]:bg-brand-soft ${
                                  grouped ? 'pl-9' : 'pl-3'
                                }`}
                              >
                                <input
                                  checked={parent.id === parentId}
                                  className="size-4 shrink-0 accent-brand"
                                  disabled={pending}
                                  name="move-destination"
                                  onChange={() => choose(parent.id)}
                                  type="radio"
                                  value={parent.id}
                                />
                                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">
                                  {parent.title}
                                </span>
                                {parent.current ? (
                                  <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[12px] font-bold text-sub ring-1 ring-border">
                                    {t('move.current')}
                                  </span>
                                ) : null}
                                <span className="shrink-0 text-[12.5px] text-sub">
                                  {kind === 'lecture'
                                    ? t('module.lecture_count', { count: parent.childCount })
                                    : t('lecture.exercise_count', { count: parent.childCount })}
                                </span>
                                {visibilityIsReal && parent.hidden ? <HiddenMark /> : null}
                              </label>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="mb-2.5 text-[14.5px] font-bold" id={positionHeadingId}>
                <StepNumber>2</StepNumber>
                {t(kind === 'lecture' ? 'move.step_position_module' : 'move.step_position_lecture')}
              </h3>
              <div
                aria-labelledby={positionHeadingId}
                className="grid gap-1 sm:grid-cols-2"
                role="radiogroup"
              >
                {options.map((option) => (
                  <label
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-[14px] transition-colors hover:bg-canvas has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
                    key={option.index}
                  >
                    <input
                      checked={option.index === index}
                      className="size-4 shrink-0 accent-brand"
                      disabled={pending}
                      name="move-position"
                      onChange={() => {
                        setIndex(option.index);
                        setError(null);
                      }}
                      type="radio"
                      value={option.index}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {positionLabel(t as unknown as Translate, kind, option)}
                    </span>
                    {option.current ? (
                      <span className="shrink-0 text-[12px] font-bold text-sub">
                        {t('move.current')}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            </section>

            <div aria-live="polite" className="space-y-2">
              <p className="rounded-lg bg-canvas px-3.5 py-3 text-[14.5px] font-semibold leading-[1.55]">
                {unchanged
                  ? t('move.unchanged')
                  : [
                      t(`move.summary_${kind}`, {
                        title: location.title,
                        destination,
                        position: summaryPosition(t as unknown as Translate, chosen),
                      }),
                      kind === 'lecture' && movedContents > 0
                        ? t('move.summary_contents', { count: movedContents })
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
              </p>
              {!unchanged && visibility?.now && !visibility.after ? (
                <p className="flex items-start gap-2 rounded-lg bg-warning/10 px-3.5 py-2.5 text-[13.5px] font-semibold leading-[1.5] text-warning">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t('move.will_hide', { hiddenBy: visibility.hiddenBy ?? '' })}
                </p>
              ) : null}
              {!unchanged && visibility && !visibility.now && visibility.after ? (
                <p className="flex items-start gap-2 rounded-lg bg-brand-soft px-3.5 py-2.5 text-[13.5px] font-semibold leading-[1.5] text-brand">
                  <Eye aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {t('move.will_show')}
                </p>
              ) : null}
              <p className="text-[13px] text-sub">{t('move.history_kept')}</p>
              {error ? (
                <p className="text-[13.5px] font-semibold text-danger" role="alert">
                  {errorText(error, t('builder.structural_error'))}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-border bg-canvas px-6 py-4">
            <button
              className="h-11 rounded-lg border border-border bg-card px-4 text-[14.5px] font-bold text-ink transition-colors hover:bg-canvas disabled:opacity-50"
              disabled={pending}
              onClick={onClose}
              type="button"
            >
              {t('common:action.cancel')}
            </button>
            <button
              className="h-11 min-w-24 rounded-lg bg-brand px-5 text-[14.5px] font-bold text-on-brand transition-colors hover:bg-brand-deep disabled:opacity-40"
              disabled={unchanged || pending}
              type="submit"
            >
              {pending ? t('move.moving') : t('move.confirm')}
            </button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}

function StepNumber({ children }: { children: string }) {
  return (
    <span className="mr-2 inline-grid size-5 place-items-center rounded-full bg-brand align-[1px] text-[11.5px] font-bold text-on-brand">
      {children}
    </span>
  );
}

function HiddenMark() {
  const { t } = useTranslation('content');
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-sub">
      <EyeOff aria-hidden className="size-3.5" />
      {t('move.hidden')}
    </span>
  );
}

/** Enough of `t` for the label helpers, without its full key-typed signature. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

function positionLabel(t: Translate, kind: MoveKind, option: PositionOption) {
  switch (option.label.kind) {
    case 'first':
      return t('move.first');
    case 'after':
      return t('move.after', { title: option.label.title });
    case 'last':
      return t('move.last');
    case 'only':
      return t(kind === 'lecture' ? 'move.only_lecture' : 'move.only_exercise');
  }
}

function summaryPosition(t: Translate, option: PositionOption | undefined) {
  switch (option?.label.kind) {
    case 'first':
      return t('move.summary_position_first');
    case 'after':
      return t('move.summary_position_after', { title: option.label.title });
    case 'only':
      return t('move.summary_position_only');
    default:
      return t('move.summary_position_last');
  }
}

function describeDestination(
  tree: CourseBuilderState['tree'],
  kind: MoveKind,
  parentId: string,
) {
  const courseModule = moduleOfParent(tree, kind, parentId);
  if (!courseModule) return '';
  if (kind === 'lecture') return courseModule.title;
  const lecture = courseModule.lectures.find((item) => item.id === parentId);
  return lecture ? `${courseModule.title} › ${lecture.title}` : courseModule.title;
}
