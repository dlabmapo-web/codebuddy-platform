import {
  endScript,
  listScript,
  registerScript,
  renewScript,
  summaryScript,
} from "./watch-session.registry.js";

/**
 * Enough Redis to exercise the watch registry's own logic.
 *
 * Follows the convention the presence registry's tests already set: strings, a
 * set index, a counter, and an `eval` that reimplements each script's
 * semantics in TypeScript. Expiry is simulated by deleting a key, which is
 * exactly what a lapsed TTL looks like from the registry's side.
 *
 * What this deliberately does **not** verify is the Lua itself — that these
 * scripts are atomic, that they behave under concurrent writers, and that the
 * cross-instance index stays consistent. Those are properties of Redis running
 * the script, not of the code around it, and the spec puts them behind a
 * Redis-backed integration test for that reason. What it does verify is
 * everything the registry decides: which keys a lease belongs to, which index
 * answers a scope, how a summary is derived, and when a generation is refused.
 */
export function createRedisDouble() {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();

  const decode = (raw: string | undefined) =>
    raw === undefined ? null : (JSON.parse(raw) as Record<string, unknown>);

  const api = {
    strings,
    sets,

    /** What a lapsed TTL looks like from the registry's side. */
    expireNow(key: string): void {
      strings.delete(key);
    },

    smembers(key: string): string[] {
      return [...(sets.get(key) ?? [])];
    },

    async get(key: string): Promise<string | null> {
      return strings.get(key) ?? null;
    },

    async set(key: string, value: string): Promise<"OK"> {
      strings.set(key, value);
      return "OK";
    },

    async del(key: string): Promise<number> {
      return strings.delete(key) ? 1 : 0;
    },

    async incr(key: string): Promise<number> {
      const next = Number(strings.get(key) ?? 0) + 1;
      strings.set(key, String(next));
      return next;
    },

    async pexpire(): Promise<number> {
      // TTLs are not simulated; `expireNow` is how a test makes a key lapse.
      return 1;
    },

    async eval(script: string, keyCount: number, ...args: string[]) {
      const keys = args.slice(0, keyCount);
      const argv = args.slice(keyCount);

      if (script === registerScript) {
        const [sessionKey, leaseKey] = keys as [string, string];
        const [payload, , generationRaw, visitId, ...indexKeys] = argv;
        const generation = Number(generationRaw);
        const previous = decode(strings.get(sessionKey!));
        let replaced: string | undefined;
        if (previous) {
          if (Number(previous.generation) >= generation) {
            return JSON.stringify({ ok: false });
          }
          replaced = previous.visitId as string;
        }
        strings.set(sessionKey!, JSON.stringify({ visitId, generation }));
        strings.set(leaseKey!, payload!);
        for (const indexKey of indexKeys) {
          const set = sets.get(indexKey) ?? new Set<string>();
          set.add(visitId!);
          sets.set(indexKey, set);
        }
        return JSON.stringify(replaced ? { ok: true, replaced } : { ok: true });
      }

      if (script === renewScript) {
        const [leaseKey, sessionKey] = keys as [string, string];
        const [generationRaw, , mode] = argv;
        const current = decode(strings.get(leaseKey!));
        if (!current) return 0;
        if (Number(current.generation) !== Number(generationRaw)) return 0;
        const session = decode(strings.get(sessionKey));
        if (session?.visitId !== current.visitId || session?.generation !== current.generation) return 0;
        if (mode) current.mode = mode;
        strings.set(leaseKey!, JSON.stringify(current));
        strings.set(
          sessionKey!,
          JSON.stringify({
            visitId: current.visitId,
            generation: Number(generationRaw),
          }),
        );
        return 1;
      }

      if (script === endScript) {
        const [leaseKey, sessionKey] = keys as [string, string];
        const [generationRaw, visitId, ...indexKeys] = argv;
        const current = decode(strings.get(leaseKey!));
        if (!current) return 0;
        if (
          generationRaw !== "" &&
          Number(current.generation) !== Number(generationRaw)
        ) {
          return 0;
        }
        strings.delete(leaseKey!);
        const session = decode(strings.get(sessionKey!));
        if (session?.visitId === visitId) strings.delete(sessionKey!);
        for (const indexKey of indexKeys) {
          sets.get(indexKey)?.delete(visitId!);
        }
        return 1;
      }

      if (script === listScript) {
        const [indexKey] = keys as [string];
        const [prefix, sessionPrefix] = argv as [string, string];
        const live: string[] = [];
        for (const visitId of [...(sets.get(indexKey!) ?? [])]) {
          const raw = strings.get(`${prefix}${visitId}`);
          if (raw !== undefined) {
            const value = JSON.parse(raw);
            const session = decode(strings.get(`${sessionPrefix}${value.teacherMembershipId}:${value.sessionId}`));
            if (session?.visitId === value.visitId && session?.generation === value.generation) live.push(raw);
          } else {
            // The prune the real script performs, and the reason a crashed
            // instance's watches stop counting without a sweeper.
            sets.get(indexKey!)?.delete(visitId);
          }
        }
        return live;
      }

      if (script === summaryScript) {
        const [indexKey, revisionKey] = keys;
        const [prefix, sessionPrefix, classId, draftId] = argv;
        let count = 0;
        let helping = 0;
        for (const id of sets.get(indexKey!) ?? []) {
          const value = decode(strings.get(`${prefix}${id}`));
          if (!value) { sets.get(indexKey!)?.delete(id); continue; }
          const session = decode(strings.get(`${sessionPrefix}${value.teacherMembershipId}:${value.sessionId}`));
          if (session?.visitId !== id || session?.generation !== value.generation) continue;
          if (classId && value.classId !== classId) continue;
          if (draftId && value.draftId !== draftId) continue;
          count++;
          if (value.mode === 'HELPING') helping++;
        }
        return [count, helping, await api.incr(revisionKey!)];
      }
      throw new Error("unrecognized script");
    },
  };

  return api;
}
