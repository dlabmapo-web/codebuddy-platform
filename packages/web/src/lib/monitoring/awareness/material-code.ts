/** Geometry fence for a plain-text snapshot, never an authorization credential. */
export function materialCodeKey(code: string): string {
  let hash = 2166136261;
  for (let index = 0; index < code.length; index++) hash = Math.imul(hash ^ code.charCodeAt(index), 16777619);
  return `${code.length}:${(hash >>> 0).toString(16)}`;
}
