'use client';

import { formatNumber } from '@cove/i18n/format';
import type { AcademyAiUsage } from '@cove/shared';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';

import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

const KST_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' });

/** One campus's AI teacher, for its manager. Counts and cost, never a student's words. */
export function AiUsage({ usage, now = new Date() }: { usage: AcademyAiUsage; now?: Date }) {
  const { t } = useTranslation('ai-usage');
  const locale = useLocale();
  const number = (value: number) => formatNumber(value, locale);
  const usd = (value: number) => `$${value.toFixed(value > 0 && value < 1 ? 4 : 2)}`;
  const spent = usage.months.find((row) => row.month === KST_MONTH.format(now))?.costUsd ?? 0;
  const week = usage.last7Days;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card title={t('switches')}>
        <dl className="divide-y divide-border">
          <Row label={t('campus')} tone={usage.enabled.campus}>{t(usage.enabled.campus ? 'on' : 'off')}</Row>
          <Row label={t('help')} tone={usage.enabled.help}>{t(usage.enabled.help ? 'on' : 'off')} · {usage.enabled.model}</Row>
          <Row label={t('library')} tone={usage.enabled.library}>{t(usage.enabled.library ? 'on' : 'off')} · {usage.enabled.libraryModel}</Row>
          <Row label={t('limits')}>
            {t('per_problem', { count: usage.problemLimit })}
            <span className="block text-[12px] font-normal text-sub">
              {usage.dailyLimit === null ? t('no_daily') : t('per_day', { count: usage.dailyLimit })}
            </span>
          </Row>
          <Row label={t('spent')}>{usd(spent)}</Row>
          <Row label={t('budget')}>{usd(usage.helpBudgetUsd)}</Row>
        </dl>
      </Card>
      <Card title={t('week')}>
        <dl className="divide-y divide-border">
          <Row label={t('replies')}>{number(week.replies)}</Row>
          <Row label={t('students')}>{number(week.students)}</Row>
          <Row label={t('matched')}>{number(week.matched)}</Row>
          <Row label={t('failed')}>{number(week.failed)}</Row>
          <Row label={t('rejected')}>{number(week.rejected)}</Row>
          <Row label={t('reported')}>{number(week.reported)}</Row>
          <Row label={t('hidden')}>{number(usage.hiddenItems)}</Row>
          <Row label={t('p95')}>{week.p95Ms === null ? '—' : `${(week.p95Ms / 1_000).toFixed(1)} s`}</Row>
        </dl>
      </Card>
      <Card title={t('libraries')}>
        {usage.libraries.length ? (
          <dl className="divide-y divide-border">
            {usage.libraries.map((row) => (
              <Row key={row.state} label={t(`state.${row.state}`)}>{number(row.count)}</Row>
            ))}
          </dl>
        ) : <Empty>{t('no_libraries')}</Empty>}
      </Card>
      <Card title={t('courses')}>
        {usage.courses.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] text-[13.5px]">
              <thead>
                <tr className="text-[12px] text-sub">
                  <Th>{t('course')}</Th><Th right>{t('problems')}</Th><Th right>{t('ready')}</Th><Th right>{t('replies_week')}</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {usage.courses.map((row) => (
                  <tr key={row.courseId}>
                    <Td>{row.title}</Td><Td right>{number(row.problems)}</Td><Td right>{number(row.ready)}</Td><Td right>{number(row.replies)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>{t('no_courses')}</Empty>}
      </Card>
      <Card className="lg:col-span-2" title={t('cost')}>
        {usage.months.length ? (
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-[12px] text-sub"><Th>{t('month')}</Th><Th right>{t('requests')}</Th><Th right>{t('usd')}</Th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {usage.months.map((row) => (
                <tr key={row.month}><Td>{row.month}</Td><Td right>{number(row.requests)}</Td><Td right>{usd(row.costUsd)}</Td></tr>
              ))}
            </tbody>
          </table>
        ) : <Empty>{t('no_cost')}</Empty>}
      </Card>
    </div>
  );
}

function Card({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-card border border-border bg-card', className)}>
      <h2 className="border-b border-border px-5 py-3 text-[14.5px] font-bold">{title}</h2>
      <div className="px-5 py-3">{children}</div>
    </section>
  );
}

function Row({ label, tone, children }: { label: string; tone?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-[13.5px]">
      <dt className="text-sub">{label}</dt>
      <dd className={cn('text-right font-semibold tabular-nums', tone === true && 'text-success', tone === false && 'text-warning')}>{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-[13.5px] text-sub">{children}</p>;
}

function Th({ right, children }: { right?: boolean; children: React.ReactNode }) {
  return <th className={cn('py-1.5 font-semibold', right ? 'text-right' : 'text-left')} scope="col">{children}</th>;
}

function Td({ right, children }: { right?: boolean; children: React.ReactNode }) {
  return <td className={cn('py-2', right && 'text-right tabular-nums')}>{children}</td>;
}
