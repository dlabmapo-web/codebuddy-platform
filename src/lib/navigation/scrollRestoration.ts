const PREFIX = 'cove-scroll:';

export function scrollRestorationKey(
  pathname: string,
  identity?: string | null,
) {
  return `${PREFIX}${pathname}:${identity || 'default'}`;
}

export function saveScrollPosition(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  position: number,
) {
  storage.setItem(key, String(Math.max(0, Math.round(position))));
}

export function readScrollPosition(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  key: string,
) {
  const raw = storage.getItem(key);
  storage.removeItem(key);
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

