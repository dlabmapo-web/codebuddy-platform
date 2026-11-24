import {
  TURTLE_USAGE_RETENTION_DAYS,
  academyLocalDate,
  addLocalDays,
  isLocalDate,
  turtleUsageInputSchema,
  type TurtleUsageInput,
} from '@cove/shared';

import { routes } from '@/lib/routes';

export const turtlePeriods = ['today', 'yesterday', '7d', '30d', '90d'] as const;
export type TurtlePeriod = (typeof turtlePeriods)[number];
/** A named period follows the calendar; chosen dates stay where they were put. */
export type TurtleQuery = {
  period: TurtlePeriod | 'custom';
  from?: string;
  to?: string;
  academyId?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure, so the server parses the same address the client does. Anything invalid is the default. */
export function parseTurtleQuery(search: string): TurtleQuery {
  const params = new URLSearchParams(search);
  const period = params.get('period') ?? '';
  const academy = params.get('academy') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const academyId = UUID.test(academy) ? academy : undefined;
  if (isLocalDate(from) && turtleUsageInputSchema.safeParse({ from, to }).success)
    return { period: 'custom', from, to, academyId };
  return {
    period: (turtlePeriods as readonly string[]).includes(period) ? (period as TurtlePeriod) : 'today',
    academyId,
  };
}

export function turtlePath(query: TurtleQuery): string {
  const params = new URLSearchParams();
  if (query.period === 'custom') {
    params.set('from', query.from!);
    params.set('to', query.to!);
  } else if (query.period !== 'today') params.set('period', query.period);
  if (query.academyId) params.set('academy', query.academyId);
  const search = params.toString();
  return search ? `${routes.adminTurtle}?${search}` : routes.adminTurtle;
}

/** The days a query means right now, in the academy time zone. */
export function turtleInput(query: TurtleQuery, now = new Date()): TurtleUsageInput {
  const today = academyLocalDate(now);
  const academy = query.academyId ? { academyId: query.academyId } : {};
  switch (query.period) {
    case 'custom':
      return { from: query.from!, to: query.to!, ...academy };
    case 'yesterday': {
      const day = addLocalDays(today, -1);
      return { from: day, to: day, ...academy };
    }
    case 'today':
      return { from: today, to: today, ...academy };
    default:
      return { from: addLocalDays(today, 1 - Number.parseInt(query.period, 10)), to: today, ...academy };
  }
}

/** Dates picked by hand, put in order and kept within what one read covers. */
export function customTurtleRange(from: string, to: string, changed: 'from' | 'to'): { from: string; to: string } | null {
  if (!isLocalDate(from) || !isLocalDate(to)) return null;
  const span = TURTLE_USAGE_RETENTION_DAYS - 1;
  if (changed === 'from') {
    const latest = addLocalDays(from, span);
    return { from, to: to < from ? from : to > latest ? latest : to };
  }
  const earliest = addLocalDays(to, -span);
  return { from: from > to ? to : from < earliest ? earliest : from, to };
}
