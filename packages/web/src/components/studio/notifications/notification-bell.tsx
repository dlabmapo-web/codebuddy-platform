'use client';

import type { AcademyRole, NotificationItem } from '@cove/shared';
import { formatShortDateTime } from '@cove/i18n/format';
import { Bell, BellOff, CheckCircle2, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { useTranslation } from 'react-i18next';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/studio/overlays';
import { useLayoutTranslation, useLocale } from '@/i18n';
import { routes } from '@/lib/routes';
import { cn } from '@/lib/utils';

import { useNotifications } from './use-notifications';

/**
 * News about the reader, in the one place on the bar that is already about
 * them.
 *
 * It sits between the theme control and the avatar rather than beside the
 * language switch: those two are about how the interface presents itself, and
 * the bell and the face are about the person reading it.
 *
 * ## Why the count and not a dot
 *
 * The nav's applicant badge is a dot when the rail is collapsed, because a
 * digit beside a 20px glyph is unreadable. Here there is room, and the number
 * answers a question the dot cannot: whether the thing you already read is the
 * only thing there is. It caps at `9+` for the same reason `NavCountBadge`
 * caps at `99+` — past that the answer is "several", and precision would cost
 * the width the glyph needs.
 *
 * It wears `draft` amber, the colour this product uses for something waiting
 * on you, and it is absent at zero: a badge that is always there stops being
 * read, and its absence is what makes its appearance information.
 */
export function NotificationBell({ className }: { className?: string }) {
  const { t } = useTranslation('notifications');
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [, startTransition] = React.useTransition();
  const notifications = useNotifications();
  const unread = notifications.unreadCount;

  /*
   * An item that arrives over the socket appears without the reader having
   * done anything, so somebody using a screen reader is given no event at all
   * unless one is spoken for them. Polite rather than assertive: an approval is
   * good news, not something worth talking over whatever they were reading.
   */
  const arrived = notifications.items.find(
    (item) => item.id === notifications.announcement,
  );

  function act(item: NotificationItem) {
    /*
     * Close before doing anything else, and run the rest in a transition —
     * the same shape, for the same reason, as `ProfileControl`'s role switch.
     *
     * While this panel is open Radix marks the content behind it
     * `aria-hidden="true"` / `data-aria-hidden="true"`. Those attributes are
     * set imperatively on nodes React does not own, so refreshing or
     * navigating from underneath an open panel reconciles a fresh server tree
     * into markup that still carries them, and React reports a hydration
     * mismatch naming the page's own container.
     *
     * It showed up here rather than on a plain navigation because entering the
     * academy from the lobby is a `push` to the URL already on screen — so the
     * work is all done by `refresh`, against DOM the closing menu had not
     * finished releasing. The transition lets the close commit first.
     */
    setOpen(false);
    startTransition(async () => {
      await notifications.acknowledge(item.id);
      if (item.kind === 'APPLICATION_APPROVED') {
        router.push(routes.academy(item.academy.slug));
        /*
         * The membership exists now, but the tree the browser is holding was
         * rendered for an applicant. Without this the next paint is the lobby
         * again, over somebody who has just been let in.
         */
        router.refresh();
        return;
      }
      router.push(routes.pending);
    });
  }

  return (
    <>
      <span aria-live="polite" className="sr-only">
        {arrived ? <ItemSentence item={arrived} /> : ''}
      </span>
      <DropdownMenu onOpenChange={setOpen} open={open}>
        <DropdownMenuTrigger
          aria-label={t('label')}
          className={cn(
            'relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-sub outline-none transition-colors hover:bg-accent hover:text-ink focus-visible:ring-2 focus-visible:ring-brand/40 data-[state=open]:bg-accent data-[state=open]:text-ink',
            className,
          )}
          title={t('label')}
        >
          <Bell aria-hidden className="size-[1.05rem]" strokeWidth={1.75} />
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute -right-0.5 -top-0.5 grid h-[1.05rem] min-w-[1.05rem] place-items-center rounded-full bg-draft px-1 text-[10.5px] font-bold leading-none tabular-nums text-on-draft ring-2 ring-card"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
          <span className="sr-only">{t('unread', { count: unread })}</span>
        </DropdownMenuTrigger>

        {/*
          Wider than the account menu beside it, and deliberately so: these rows
          carry two sentences and an action, where that menu carries one word
          per row. At the old width every message wrapped to four lines and the
          action sat under a ragged column of text.
        */}
        <DropdownMenuContent align="end" className="w-[24rem] p-0">
          <header className="flex items-center justify-between gap-3 border-b border-border px-3.5 py-3">
            <h2 className="text-[14px] font-bold text-ink">{t('title')}</h2>
            {unread > 0 ? (
              <span className="rounded-full bg-draft/15 px-2 py-0.5 text-[11px] font-bold tabular-nums text-draft">
                {t('unread_badge', { count: unread })}
              </span>
            ) : null}
          </header>

          {notifications.loading ? (
            <p className="px-3.5 py-6 text-center text-[13px] text-sub">
              {t('loading')}
            </p>
          ) : notifications.failed ? (
            <p className="px-3.5 py-6 text-center text-[13px] text-danger">
              {t('failed')}
            </p>
          ) : notifications.items.length === 0 ? (
            <div className="flex flex-col items-center px-3.5 py-8 text-center">
              {/* The icon is what stops an empty panel reading as a broken
                  one — the same reason `EmptyState` carries one. */}
              <span
                aria-hidden
                className="mb-2.5 grid size-10 place-items-center rounded-2xl bg-accent text-sub"
              >
                <BellOff className="size-[1.15rem]" strokeWidth={2} />
              </span>
              <p className="text-[13px] text-sub">{t('empty')}</p>
            </div>
          ) : (
            <ul className="max-h-[26rem] divide-y divide-border overflow-y-auto">
              {notifications.items.map((item) => (
                <li key={item.id}>
                  <NotificationRow item={item} onAct={act} />
                </li>
              ))}
            </ul>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/**
 * One decision.
 *
 * A card rather than a menu item, because it carries a heading, a sentence, a
 * time and an action — and because the action is a real button. It used to be
 * a line of blue text under the message, which asked the reader to work out
 * that the whole row was clickable; the button says where it goes and can be
 * reached by keyboard on its own.
 *
 * An unread row is tinted by its own outcome, carries a filled icon and offers
 * a solid button. A read one keeps none of those. That is what makes "is there
 * anything new here" answerable without reading a word — and it is not
 * decoration: a decision you have already acted on must stop asking to be
 * acted on.
 *
 * The row stays in the list after it is read, because when you were approved
 * is worth being able to look up. It just stops being an instruction and
 * becomes a record, with the destination still reachable as a quiet link. The
 * bug this fixes: after entering the academy, the panel still showed a solid
 * "Enter academy" beside a membership the reader was already using.
 */
function NotificationRow({
  item,
  onAct,
}: {
  item: NotificationItem;
  onAct: (item: NotificationItem) => void;
}) {
  const { t } = useTranslation('notifications');
  const locale = useLocale();
  const approved = item.kind === 'APPLICATION_APPROVED';
  const unread = item.acknowledgedAt === null;
  const Icon = approved ? CheckCircle2 : XCircle;

  return (
    <div
      className={cn(
        'px-3.5 py-3.5 transition-colors',
        unread && (approved ? 'bg-success/[0.05]' : 'bg-danger/[0.04]'),
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cn(
            'mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl',
            unread
              ? approved
                ? 'bg-success text-on-success'
                : 'bg-danger text-on-danger'
              : approved
                ? 'bg-success/12 text-success'
                : 'bg-danger/12 text-danger',
          )}
        >
          <Icon className="size-[1.05rem]" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3
            className={cn(
              'truncate text-[13.5px] font-bold',
              unread ? 'text-ink' : 'text-sub',
            )}
          >
              {t(approved ? 'approved.title' : 'rejected.title')}
            </h3>
            {unread ? (
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full bg-draft"
              />
            ) : null}
            <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-sub">
              {formatShortDateTime(item.createdAt, locale)}
            </span>
          </div>
          <p className="mt-1 text-[12.5px] leading-[1.55] text-sub">
            <ItemSentence item={item} />
          </p>
          {/* Only while it is still news. Once they are inside the academy,
              telling them their pages are about to fill in describes something
              that already happened. */}
          {approved && unread ? (
            <p className="mt-0.5 text-[12px] leading-[1.5] text-sub/80">
              {t('action_hint')}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 pl-[2.625rem]">
        <button
          className={cn(
            'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40',
            unread
              ? cn(
                  'inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-bold',
                  approved
                    ? 'bg-brand text-on-brand hover:bg-brand-deep'
                    : 'border border-border text-ink hover:bg-accent',
                )
              : // Read: still reachable, no longer an instruction.
                'rounded text-[12.5px] font-semibold text-sub underline-offset-4 hover:text-ink hover:underline',
          )}
          onClick={() => onAct(item)}
          type="button"
        >
          {t(approved ? 'approved.action' : 'rejected.action')}
        </button>
      </div>
    </div>
  );
}

/**
 * One sentence for an item, used by the row and by the live region, so what a
 * screen reader hears and what the panel shows cannot come apart.
 *
 * A component rather than a helper because the role's name lives in `common`,
 * which is a *layout* namespace. This panel mounts its own isolated i18next
 * instance holding `notifications` alone, so a `common:` lookup inside it
 * resolved to nothing and the message read "approved you as role.STUDENT".
 * `useLayoutTranslation` reaches the instance that actually has the word —
 * the same split `pending-presentation.ts` documents, and for the same reason:
 * the membership vocabulary is one word everywhere it appears.
 */
function ItemSentence({ item }: { item: NotificationItem }) {
  const { t } = useTranslation('notifications');
  const { t: layout } = useLayoutTranslation('common');

  if (item.kind === 'APPLICATION_APPROVED') {
    return (
      <>
        {item.role
          ? t('approved.body', {
              academy: item.academy.name,
              role: layout(`role.${item.role satisfies AcademyRole}`),
            })
          : t('approved.body_no_role', { academy: item.academy.name })}
      </>
    );
  }

  return (
    <>
      {t('rejected.body', { academy: item.academy.name })}
      {item.reason
        ? ` ${t('rejected.reason', { reason: item.reason })}`
        : ''}
    </>
  );
}
