'use client';

import type { PointPolicy, PointPolicyState } from '@cove/shared';
import {
  DEFAULT_POINT_POLICY,
  applyDailyCap,
  awardsAboveDailyCap,
  learningTiersReached,
  pointPolicySchema,
  pointRulesFrom,
} from '@cove/shared';
import { formatNumber } from '@cove/i18n/format';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, TriangleAlert } from 'lucide-react';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/studio/button';
import { Modal, ModalContent } from '@/components/studio/primitives';
import { useLocale } from '@/i18n';
import { useErrorText } from '@/i18n/client/use-error-text';
import { orpc } from '@/lib/orpc';
import { cn } from '@/lib/utils';

import { PointRulesPanel } from '../../../points/_components/point-rules';
import { NumberField } from './number-field';
import {
  isDirty,
  policyErrorCopy,
  policyErrorKey,
  samePolicy,
  toDraft,
  toPolicy,
  unparseableFields,
  type PolicyDraft,
  type PolicyErrorKey,
  type PolicyField,
} from '../_lib/policy-draft';

const policyKey = (academyId: string) =>
  ['academy', academyId, 'point-policy'] as const;

/** What the cap warning calls each award. */
const amountCopy = {
  solveEasy: 'policy.amount.solveEasy',
  solveMedium: 'policy.amount.solveMedium',
  solveHard: 'policy.amount.solveHard',
  lectureCompleted: 'policy.amount.lectureCompleted',
  moduleCompleted: 'policy.amount.moduleCompleted',
  courseCompleted: 'policy.amount.courseCompleted',
  attendance: 'policy.amount.attendance',
  attendanceLate: 'policy.amount.attendanceLate',
  learningTimeTier1Points: 'policy.amount.learningTimeTier1Points',
  learningTimeTier2Points: 'policy.amount.learningTimeTier2Points',
  learningTimeTier3Points: 'policy.amount.learningTimeTier3Points',
} as const;

/** The day the example describes: an hour of study, and nothing unusual. */
const EXAMPLE_SOLVES = 3;
const EXAMPLE_MINUTES = 60;

/**
 * The academy's own point economy, as a rate card.
 *
 * ## One column, and every number on one rail
 *
 * The first build put the editor beside the student's preview in two columns
 * and the preview lost: it is a three-card grid built for a full measure, and
 * in a 20rem rail its headings wrapped to one word a line. Everything stacks
 * now — the sections a manager edits, then the panel their students read.
 *
 * Inside a section the fields are rows rather than a grid of boxes, because
 * this is a price list and a price list is read down its right-hand edge. Name
 * on the left, amount on the right, unit after it, tabular figures so the
 * digits line up column by column. A grid of labelled boxes makes a reader
 * hunt for the number belonging to each name, which is the one comparison they
 * came here to make.
 *
 * The editing column is held to a readable measure while the preview spans the
 * page. A row whose label sits 700px from its number is the two-column problem
 * again, drawn the other way round.
 *
 * ## One save, not seventeen requests
 *
 * The feature switches next door submit on every touch, and they are right to:
 * each switch is independent. These are not. The rules that hold this policy
 * together run *between* fields — a hard problem against an easy one, the
 * rungs of the time ladder against each other — so raising `solveHard` from 10
 * to 25 by way of `solveMedium` is a sequence of states, most of which are
 * invalid on their own. A form that submitted as you typed would reject the
 * middle of nearly every edit.
 *
 * ## Two things a manager cannot work out from seventeen numbers
 *
 * What a day adds up to, and what a child will read. So the daily limit
 * section computes an ordinary day from the draft — through `learningTiersReached`
 * and `applyDailyCap`, the same functions that would pay it — and the page
 * ends with `PointRulesPanel` fed by `pointRulesFrom`, which is what the
 * server calls to build the rules a student sees. Neither can promise
 * something the server would not pay, because in both cases there is only one
 * function.
 */
export function PointPolicyForm({
  academyId,
  initialState,
}: {
  academyId: string;
  initialState: PointPolicyState | null;
}) {
  const { t } = useTranslation('points');
  const locale = useLocale();
  const errorText = useErrorText();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: policyKey(academyId),
    queryFn: () => orpc.points.policy.get({ academyId }),
    ...(initialState ? { initialData: initialState } : {}),
  });

  const saved = query.data?.policy ?? DEFAULT_POINT_POLICY;
  const [draft, setDraft] = React.useState<PolicyDraft>(() => toDraft(saved));
  // The saved values are the baseline for "changed", so a refetch that brings
  // new ones has to move it — otherwise Cancel restores a policy nobody holds.
  const [baseline, setBaseline] = React.useState(saved);
  if (baseline !== saved) {
    setBaseline(saved);
    setDraft(toDraft(saved));
  }

  const adopt = (state: PointPolicyState) => {
    queryClient.setQueryData(policyKey(academyId), state);
    setBaseline(state.policy);
    setDraft(toDraft(state.policy));
    // The rules a student reads are built from this policy, so every points
    // page this browser has cached is out of date by exactly what just changed.
    queryClient.invalidateQueries({ queryKey: ['points'] });
  };

  const save = useMutation({
    mutationFn: (policy: PointPolicy) =>
      orpc.points.policy.update({ academyId, policy }),
    onSuccess: adopt,
  });
  const reset = useMutation({
    mutationFn: () => orpc.points.policy.reset({ academyId }),
    onSuccess: (state) => {
      adopt(state);
      setConfirming(false);
    },
  });
  const [confirming, setConfirming] = React.useState(false);

  const parsed = toPolicy(draft);
  const validation = parsed ? pointPolicySchema.safeParse(parsed) : null;
  const errors = new Map<string, PolicyErrorKey>();
  // An emptied box is its own message. Without this the schema never runs —
  // the draft is not a policy — and the field a manager is standing in would
  // simply go quiet while Save stayed disabled for no stated reason.
  for (const field of unparseableFields(draft)) errors.set(field, 'REQUIRED');
  for (const issue of validation?.error?.issues ?? []) {
    const field = issue.path[0];
    if (typeof field === 'string' && !errors.has(field)) {
      errors.set(field, policyErrorKey(issue));
    }
  }
  const valid = validation?.success === true;
  const dirty = isDirty(draft, baseline);
  const busy = save.isPending || reset.isPending;

  /*
   * The preview follows the draft while it is a policy, and holds otherwise.
   *
   * Held in state rather than a ref: a ref read during render is a value React
   * cannot know changed, and this one decides what is on screen. The value
   * comparison is what keeps it from looping — `toPolicy` builds a new object
   * every render, so identity would never settle.
   */
  const [preview, setPreview] = React.useState<PointPolicy>(saved);
  if (valid && parsed && !samePolicy(preview, parsed)) setPreview(parsed);

  const changed = (name: PolicyField) => draft[name] !== String(baseline[name]);
  const number = (value: number) => formatNumber(value, locale);
  const points = t('policy.unit.points');
  const minutes = t('policy.unit.minutes');

  /*
   * How far one press moves each kind of value.
   *
   * Not always 1: the units are not comparable. A course completion of 150
   * nudged by 1 is a rounding error; a grace period of 15 minutes nudged by 1
   * is a decision. The bounds are the schema's own, so the control cannot
   * offer a value the server would refuse.
   */
  const box = (name: PolicyField, unit: string, label: string) => {
    const isMinutes = unit === minutes;
    const isCap = name === 'studentDailyCap';
    return (
      <NumberField
        changed={changed(name)}
        disabled={busy}
        invalid={errors.has(name)}
        label={label}
        max={isMinutes ? 1440 : isCap ? 10000 : 1000}
        min={isMinutes ? 1 : isCap ? 1 : 0}
        onChange={(next) =>
          setDraft((current) => ({ ...current, [name]: next }))
        }
        step={isCap ? 10 : isMinutes ? 5 : 1}
        unit={unit}
        value={draft[name]}
      />
    );
  };

  /** One priced thing: what it is on the left, what it pays on the right. */
  const row = (
    name: PolicyField,
    label: string,
    unit: string,
    hint?: string,
  ) => (
    <label
      className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 border-t border-border/60 py-3"
      key={name}
    >
      <span className="min-w-[10rem] flex-1">
        <span className="text-[14px] font-semibold">{label}</span>
        {hint ? (
          <span className="mt-0.5 block text-[12.5px] leading-[1.5] text-sub">
            {hint}
          </span>
        ) : null}
      </span>
      {box(name, unit, label)}
      {errors.has(name) ? (
        <span className="w-full text-[12.5px] font-semibold text-danger">
          {t(policyErrorCopy[errors.get(name)!])}
        </span>
      ) : null}
    </label>
  );

  /*
   * Two rows to a line once there is room for two.
   *
   * A single column across the studio's full measure puts a label at the left
   * edge and its number six hundred pixels away, which is the two-column
   * problem drawn the other way round. Pairs stay close, and the page stops
   * being a narrow ribbon down the middle of an empty card.
   */
  const section = (
    title: string,
    note: string,
    children: React.ReactNode,
    columns = 'lg:grid-cols-2',
  ) => (
    <section className="rounded-card border border-border bg-card px-5 py-4">
      <h2 className="text-[15px] font-extrabold tracking-[-0.01em]">{title}</h2>
      <p className="mt-1 max-w-3xl text-[13px] leading-[1.6] text-sub">{note}</p>
      <div className={cn('mt-2 grid gap-x-10', columns)}>{children}</div>
    </section>
  );

  /** One rung: how long a student studied, and what reaching it pays. */
  const rung = (tier: 1 | 2 | 3) => {
    const minuteField = `learningTimeTier${tier}Minutes` as const;
    const pointField = `learningTimeTier${tier}Points` as const;
    const broken = errors.get(minuteField) ?? errors.get(pointField);
    return (
      <div
        className="flex flex-col gap-2.5 border-t border-border/60 py-3.5"
        key={tier}
      >
        <span className="text-[14px] font-semibold">
          {t('policy.step', { tier })}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-sub">
          {t('policy.after')}
          {box(minuteField, minutes, t('policy.field.tier_minutes', { tier }))}
        </span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-sub">
          {t('policy.pays')}
          {box(pointField, points, t('policy.field.tier_points', { tier }))}
        </span>
        {broken ? (
          <span className="text-[12.5px] font-semibold text-danger">
            {t(policyErrorCopy[broken])}
          </span>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        {query.data?.isCustom === false ? (
          <p className="rounded-lg border border-border bg-accent/40 px-4 py-3 text-[13.5px] leading-[1.6] text-sub">
            {t('policy.following_defaults')}
          </p>
        ) : null}

        {save.isError || reset.isError ? (
          <p className="rounded-lg border border-danger/25 bg-danger/5 px-4 py-3 text-[14px] text-danger">
            {errorText(save.error ?? reset.error)}
          </p>
        ) : null}

        {section(
          t('policy.group.solve'),
          t('policy.hint.solve'),
          <>
            {row('solveEasy', t('policy.field.solve_easy'), points)}
            {row('solveMedium', t('policy.field.solve_medium'), points)}
            {row('solveHard', t('policy.field.solve_hard'), points)}
          </>,
        )}

        {section(
          t('policy.group.finish'),
          t('policy.hint.finish'),
          <>
            {row('lectureCompleted', t('policy.field.lecture'), points)}
            {row('moduleCompleted', t('policy.field.module'), points)}
            {row('courseCompleted', t('policy.field.course'), points)}
          </>,
        )}

        {section(
          t('policy.group.attendance'),
          t('policy.hint.attendance'),
          <>
            {row('attendance', t('policy.field.attendance'), points)}
            {row('attendanceLate', t('policy.field.attendance_late'), points)}
            {/* Minutes, not points. In this section rather than one of their
                own because they answer the question the two rows above raise —
                what counts as being there — and a heading between them would
                put that answer somewhere else entirely. */}
            {row(
              'attendanceMinMinutes',
              t('policy.field.min_minutes'),
              minutes,
              t('policy.hint.min_minutes'),
            )}
            {row(
              'attendanceGraceMinutes',
              t('policy.field.grace_minutes'),
              minutes,
              t('policy.hint.grace_minutes'),
            )}
          </>,
        )}

        {section(
          t('policy.group.learning_time'),
          t('policy.hint.learning_time'),
          <>
            {rung(1)}
            {rung(2)}
            {rung(3)}
          </>,
          'md:grid-cols-3 md:gap-x-8',
        )}

        {section(
          t('policy.group.cap'),
          t('policy.hint.cap'),
          <>
            {row('studentDailyCap', t('policy.field.cap'), points)}
            <ExampleDay policy={preview} />
            <CapWarning policy={preview} />
          </>,
          'grid-cols-1',
        )}
      </div>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-extrabold tracking-[-0.01em]">
            {t('policy.preview.title')}
          </h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-[1.6] text-sub">
            {t('policy.preview.description')}
          </p>
        </div>
        <PointRulesPanel rules={pointRulesFrom(preview)} />
      </section>

      {/*
       * The bar follows the reader down the page. Seventeen fields is more
       * than one screen, so a Save at the foot of the document is a Save that
       * has to be scrolled back to — and what it would be scrolled past is the
       * preview, which is what a manager wants to be looking at when they
       * decide.
       */}
      <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border bg-card/95 px-6 py-4 backdrop-blur">
        <Button
          disabled={!dirty || !valid || busy}
          onClick={() => parsed && save.mutate(parsed)}
          type="button"
        >
          {t('policy.save')}
        </Button>
        <Button
          disabled={!dirty || busy}
          onClick={() => setDraft(toDraft(baseline))}
          type="button"
          variant="ghost"
        >
          {t('policy.cancel')}
        </Button>

        <p className="max-w-sm text-[12.5px] leading-[1.5] text-sub">
          {dirty ? t('policy.unsaved_note') : t('policy.forward_only')}
        </p>

        <Modal onOpenChange={setConfirming} open={confirming}>
          <Button
            className="ml-auto"
            disabled={busy || query.data?.isCustom !== true}
            onClick={() => setConfirming(true)}
            type="button"
            variant="outline"
          >
            <RotateCcw aria-hidden className="size-4" />
            {t('policy.reset')}
          </Button>
          <ModalContent
            description={t('policy.reset_confirm')}
            title={t('policy.reset')}
          >
            <div className="flex justify-end gap-2 px-6 py-5">
              <Button
                disabled={busy}
                onClick={() => setConfirming(false)}
                type="button"
                variant="ghost"
              >
                {t('policy.cancel')}
              </Button>
              <Button disabled={busy} onClick={() => reset.mutate()} type="button">
                {t('policy.reset')}
              </Button>
            </div>
          </ModalContent>
        </Modal>
      </div>
    </div>
  );

  /**
   * What an ordinary day comes to, under these numbers.
   *
   * Seventeen values do not add up to anything a person can picture, and the
   * daily limit is the one field whose effect is invisible until a child hits
   * it. So the day is spelled out and totalled: turning up, three easy
   * problems, one lecture, an hour of study — through `learningTiersReached`
   * and `applyDailyCap`, which are the functions that would actually pay it.
   * If the arithmetic here and the ledger ever disagreed, this would be the
   * lie, so it is computed rather than described.
   */
  function ExampleDay({ policy }: { policy: PointPolicy }) {
    const tiers = learningTiersReached(EXAMPLE_MINUTES, policy);
    const timePoints = tiers.reduce((sum, tier) => sum + tier.points, 0);
    const terms = [
      { key: 'attend', label: t('policy.example.attend'), amount: policy.attendance },
      {
        key: 'solve',
        // `problems`, not `count`: a `count` would put i18next's plural
        // machinery in front of a key that has one form in both languages.
        label: t('policy.example.solve', { problems: EXAMPLE_SOLVES }),
        amount: policy.solveEasy * EXAMPLE_SOLVES,
      },
      { key: 'lecture', label: t('policy.example.lecture'), amount: policy.lectureCompleted },
      {
        key: 'time',
        label: t('policy.example.time', { minutes: EXAMPLE_MINUTES }),
        amount: timePoints,
      },
    ];
    const total = terms.reduce((sum, term) => sum + term.amount, 0);
    const { amount: paid, capped } = applyDailyCap(total, 0, policy);
    const filled = Math.min(100, Math.round((paid / Math.max(total, 1)) * 100));

    return (
      <div className="mt-4 rounded-lg border border-border bg-canvas px-4 py-3.5">
        <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-sub">
          {t('policy.example.title')}
        </p>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <ul className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
            {terms.map((term) => (
              <li
                className="flex items-baseline justify-between gap-4 text-[13.5px]"
                key={term.key}
              >
                <span className="min-w-0 text-sub">{term.label}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {t('rules.value', { points: number(term.amount) })}
                </span>
              </li>
            ))}
          </ul>

          <div className="min-w-[10rem]">
            <p className="text-[12.5px] font-semibold text-sub">
              {t('policy.example.total')}
            </p>
            <p
              className={cn(
                'text-[26px] font-extrabold leading-none tabular-nums',
                capped && 'text-draft',
              )}
            >
              {t('rules.value', { points: number(paid) })}
            </p>
            {capped ? (
              <>
                {/* The limit, drawn. A sentence saying a day was trimmed is
                    read once; a bar that stops short is read every time the
                    number above it moves. */}
                <div
                  aria-hidden
                  className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-draft/15"
                >
                  <div
                    className="h-full rounded-full bg-draft"
                    style={{ width: `${filled}%` }}
                  />
                </div>
                <p className="mt-2 text-[12.5px] leading-[1.5] text-draft">
                  {t('policy.example.capped', {
                    total: number(total),
                    cap: number(policy.studentDailyCap),
                  })}
                </p>
              </>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  /** Awards the limit will trim, named before a ledger line names them. */
  function CapWarning({ policy }: { policy: PointPolicy }) {
    const capped = awardsAboveDailyCap(policy);
    if (capped.length === 0) return null;

    return (
      <p className="mt-3 flex items-start gap-2 rounded-lg border border-draft/30 bg-draft/5 px-4 py-3 text-[13px] leading-[1.6] text-draft">
        <TriangleAlert aria-hidden className="mt-px size-4 shrink-0" />
        <span>
          {t('policy.capped_warning', {
            cap: number(policy.studentDailyCap),
            names: capped
              .map((entry) => t(amountCopy[entry.field]))
              .join(t('policy.list_separator')),
          })}
        </span>
      </p>
    );
  }
}
