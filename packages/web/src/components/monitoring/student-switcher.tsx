'use client';

import { monitoringServerEvents, type AccessRevokedEvent } from '@cove/shared';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ExternalLink, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useAcademySlug } from '@/components/studio/academy-route-provider';
import { useLocale } from '@/i18n';
import { mergeRoster, studentSearchText } from '@/lib/monitoring/roster';
import { StudentSwitchNavigation } from '@/lib/monitoring/student-switch-navigation';
import { switcherOrder } from '@/lib/monitoring/student-switcher-order';
import { useClassPresence } from '@/lib/monitoring/use-class-presence';
import { orpc } from '@/lib/orpc';
import { routes } from '@/lib/routes';

const focusStyle = 'outline-none focus-visible:ring-2 focus-visible:ring-brand/40';

type Props = {
  academyId: string; classId: string; membershipId: string; name: string; className: string;
  prepare?: () => Promise<boolean>; cancel?: () => void;
};

export function StudentSwitcher(props: Props) {
  const { t } = useTranslation('monitoring');
  const router = useRouter();
  const participants = useParticipants(props.academyId, props.classId);
  const [open, setOpen] = React.useState(false);
  const [destination, setDestination] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'waiting' | 'failed'>('idle');
  const [navigation] = React.useState(() => new StudentSwitchNavigation());
  const trigger = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    trigger.current?.focus({ preventScroll: true });
    return () => navigation.cancel();
  }, [navigation]);
  const select = async (href: string) => {
    setDestination(href);
    setStatus('waiting');
    const result = await navigation.request(
      () => props.prepare?.() ?? Promise.resolve(true),
      () => { setOpen(false); router.push(href, { scroll: false }); },
    );
    if (result === 'failed') setStatus('failed');
  };
  const stay = () => {
    navigation.cancel();
    props.cancel?.();
    setStatus('idle');
    setDestination(null);
  };
  return <Popover.Root open={open} onOpenChange={(value) => { if (!value) stay(); setOpen(value); }}>
    <Popover.Trigger asChild>
      <button ref={trigger} type="button" aria-label={t('switcher.trigger', { name: props.name })}
        className={`flex min-h-10 min-w-0 max-w-64 items-center gap-2.5 rounded-lg px-2 py-1 text-left hover:bg-canvas data-[state=open]:bg-canvas ${focusStyle}`}>
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-peer-soft text-[13px] font-bold text-peer">{[...props.name][0]?.toUpperCase() ?? '?'}</span>
        <span className="min-w-0"><span className="block truncate text-sm font-bold">{props.name}</span><span className="block truncate text-xs text-sub">{props.className}</span></span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-sub" />
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content align="start" sideOffset={8} collisionPadding={12} aria-label={t('switcher.title')}
        className="z-50 flex max-h-[min(480px,var(--radix-popover-content-available-height))] w-[384px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <div className="border-b border-border px-4 py-3"><h2 className="text-sm font-bold">{t('switcher.title')}</h2><p className="truncate text-xs text-sub">{props.className}</p></div>
        {status !== 'idle' ? <div role="status" className="border-b border-border bg-canvas px-4 py-3 text-sm">
          <p>{status === 'waiting' ? t('switcher.waiting') : t('switcher.failed')}</p>
          <div className="mt-2 flex gap-3">
            {status === 'failed' && destination ? <button className={`rounded text-brand ${focusStyle}`} onClick={() => void select(destination)} type="button">{t('switcher.retry_switch')}</button> : null}
            <button className={`rounded text-sub ${focusStyle}`} onClick={stay} type="button">{t('switcher.stay')}</button>
          </div>
        </div> : null}
        {open ? <Participants {...props} data={participants} onSelect={(href) => void select(href)} onCurrent={() => { stay(); setOpen(false); }} /> : null}
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;
}

function Participants({ academyId, classId, membershipId, onSelect, onCurrent, data }: Props & { data: ReturnType<typeof useParticipants>; onSelect: (href: string) => void; onCurrent: () => void }) {
  const { t } = useTranslation('monitoring');
  const locale = useLocale();
  const slug = useAcademySlug();
  const [search, setSearch] = React.useState('');
  return <>
    <label className="mx-3 my-3 flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 focus-within:ring-2 focus-within:ring-brand/40">
      <Search aria-hidden className="size-4 text-sub" />
      <input autoFocus aria-label={t('roster.search_placeholder')} placeholder={t('roster.search_placeholder')} className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} />
    </label>
    <ParticipantRows data={data} academyId={academyId} classId={classId} membershipId={membershipId} search={search} locale={locale} slug={slug} onSelect={onSelect} onCurrent={onCurrent} />
  </>;
}

function useParticipants(academyId: string, classId: string) {
  const presence = useClassPresence({ academyId, classId });
  // Keep this workspace-scoped authorized roster and presence subscription alive
  // across popover opens, without borrowing another workspace or actor cache.
  const [requestId] = React.useState(() => crypto.randomUUID());
  const query = useQuery({ queryKey: ['academy', academyId, 'switcher-roster', classId, requestId], queryFn: () => orpc.monitoring.getClassRoster({ academyId, classId }), retry: false, gcTime: 0, refetchInterval: 30_000 });
  const refetch = query.refetch;
  const retry = () => { presence.refresh(); void refetch(); };
  const [revoked, setRevoked] = React.useState<Set<string>>(() => new Set());
  React.useEffect(() => {
    const onRevoked = (event: AccessRevokedEvent) => {
      if (event.classId !== classId || !event.studentMembershipId) return;
      setRevoked((old) => new Set([...old, event.studentMembershipId!]));
      void refetch();
    };
    presence.socket?.on(monitoringServerEvents.accessRevoked, onRevoked);
    return () => { presence.socket?.off(monitoringServerEvents.accessRevoked, onRevoked); };
  }, [classId, presence.socket, refetch]);
  const rows = query.data ? mergeRoster(query.data.students.filter((row) => !revoked.has(row.membershipId)), presence.entries, query.data.exercises) : [];
  return { presence, query, retry, rows };
}

function ParticipantRows({ classId, membershipId, search, locale, slug, onSelect, onCurrent, data }: {
  data: ReturnType<typeof useParticipants>;
  academyId: string; classId: string; membershipId: string; search: string; locale: string; slug: string;
  onSelect: (href: string) => void; onCurrent: () => void;
}) {
  const { t } = useTranslation('monitoring');
  const { presence, query, retry, rows } = data;
  const [order, setOrder] = React.useState<string[]>([]);
  if (presence.snapshotReady && query.isSuccess) {
    const next = switcherOrder(rows, membershipId, locale, order);
    if (next.length !== order.length || next.some((id, i) => id !== order[i])) setOrder(next);
  }
  const fresh = presence.snapshotReady && query.isSuccess && !query.isFetching;
  const error = query.isError || presence.denied !== null || presence.state === 'degraded' || presence.state === 'revoked';
  const byId = new Map(rows.map((row) => [row.membershipId, row]));
  const visible = (order.length ? order : rows.map((row) => row.membershipId)).flatMap((id) => {
    const row = byId.get(id);
    return row && studentSearchText(row).toLocaleLowerCase(locale).includes(search.trim().toLocaleLowerCase(locale)) ? [row] : [];
  });
  return <div className="min-h-0 overflow-y-auto overscroll-contain px-2 pb-2">
    {!fresh ? <div role="status" className="px-2 py-3 text-sm text-sub"><p>{error ? t('switcher.unavailable') : t('switcher.updating')}</p><button className={`mt-2 rounded text-brand ${focusStyle}`} onClick={retry} type="button">{t('switcher.retry')}</button></div> : null}
    {fresh && visible.length === 0 ? <p className="px-2 py-4 text-sm text-sub">{rows.length ? t('switcher.no_matches') : t('roster.no_enrollments')}</p> : null}
    {query.isPending ? <div aria-hidden className="space-y-2 px-2">{[0, 1, 2].map((index) => <div key={index} className="flex h-16 items-center gap-3 motion-safe:animate-pulse"><span className="size-8 rounded-full bg-canvas" /><span className="h-4 w-40 rounded bg-canvas" /></div>)}</div> : null}
    <ul className="space-y-1">{visible.map((row) => {
      const current = row.membershipId === membershipId;
      const name = row.displayName ?? row.email ?? row.membershipId;
      const href = routes.academyTeachStudentLive(slug, classId, row.membershipId);
      const available = fresh && row.canOpenLive;
      const detail = !fresh ? t('switcher.updating') : !row.active ? t('roster.membership_inactive') : row.canOpenLive ? `${t('roster.in_exercise')}${row.exercise ? ` · ${row.exercise.title}` : ''}` : row.state === 'ONLINE' || row.state === 'IDLE' ? t('roster.no_exercise') : t(`state.${row.state}`);
      const content = <><span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-canvas text-xs font-bold text-sub">{[...name][0]?.toUpperCase() ?? '?'}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{name}</span><span title={detail} className="block truncate text-xs text-sub">{detail}</span></span>{current ? <span className="shrink-0 text-xs font-semibold text-brand">{t('switcher.current')}</span> : null}</>;
      const primary = `flex min-h-16 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 text-left ${focusStyle}`;
      return <li key={row.membershipId} className={`flex items-center gap-2 rounded-lg ${current ? 'bg-brand/10' : ''}`}>
        {current ? <button aria-current="page" className={primary} type="button" onClick={onCurrent}>{content}</button> : available ? <Link prefetch={false} href={href} className={`${primary} hover:bg-canvas`} onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault(); onSelect(href);
        }}>{content}</Link> : <div className={primary}>{content}</div>}
        {!current && available ? <Link prefetch={false} href={href} target="_blank" rel="noopener noreferrer" title={t('switcher.new_tab', { name })} aria-label={t('switcher.new_tab', { name })} className={`mr-2 grid size-9 shrink-0 place-items-center rounded-lg border border-border text-sub hover:border-brand/40 hover:bg-brand/5 hover:text-brand ${focusStyle}`}><ExternalLink aria-hidden className="size-4" /></Link> : null}
      </li>;
    })}</ul>
  </div>;
}
