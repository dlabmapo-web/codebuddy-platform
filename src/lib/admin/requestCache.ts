export interface RequestCache<Key, Value> {
  get: (
    key: Key,
    load: () => Promise<Value>,
    options?: { force?: boolean },
  ) => Promise<Value>;
  invalidate: (key?: Key) => void;
}

export function createRequestCache<Key, Value>(): RequestCache<Key, Value> {
  const values = new Map<Key, Value>();
  const inFlight = new Map<Key, Promise<Value>>();

  return {
    get(key, load, options = {}) {
      const active = inFlight.get(key);
      if (active) return active;

      if (!options.force && values.has(key)) {
        return Promise.resolve(values.get(key) as Value);
      }

      const request = load()
        .then((value) => {
          values.set(key, value);
          return value;
        })
        .finally(() => {
          inFlight.delete(key);
        });
      inFlight.set(key, request);
      return request;
    },

    invalidate(key) {
      if (key === undefined) {
        values.clear();
        return;
      }
      values.delete(key);
    },
  };
}
