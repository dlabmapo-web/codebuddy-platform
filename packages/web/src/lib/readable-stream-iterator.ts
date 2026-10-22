export type IterableReadableStream<T> = ReadableStream<T> & AsyncIterable<T> & {
  values(options?: { preventCancel?: boolean }): AsyncIterableIterator<T>;
};

/** PDF.js 6 consumes text streams with for-await; some Safari versions only expose getReader. */
function values<T>(this: ReadableStream<T>, { preventCancel = false }: { preventCancel?: boolean } = {}): AsyncIterableIterator<T> {
  const reader = this.getReader();
  let finished = false;
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <R>(operation: () => Promise<R>): Promise<R> => {
    const next = tail.then(operation, operation);
    tail = next.then(() => undefined, () => undefined);
    return next;
  };
  return {
    next: () => serial(async () => {
      if (finished) return { done: true as const, value: undefined };
      try {
        const result = await reader.read();
        if (result.done) { finished = true; reader.releaseLock(); }
        return result;
      } catch (error) {
        finished = true;
        reader.releaseLock();
        throw error;
      }
    }),
    return: (value?: unknown) => serial(async () => {
      if (!finished) {
        finished = true;
        try { if (!preventCancel) await reader.cancel(value); }
        finally { reader.releaseLock(); }
      }
      return { done: true as const, value };
    }),
    [Symbol.asyncIterator]() { return this; },
  };
}

/** Feature-detected compatibility only: preserve native implementations and stream cancellation. */
export function ensureReadableStreamIterator(
  Stream: { prototype: ReadableStream<unknown> } | undefined = globalThis.ReadableStream,
): void {
  if (!Stream) return;
  const prototype = Stream.prototype as ReadableStream<unknown> & Partial<IterableReadableStream<unknown>>;
  const iterate = typeof prototype.values === 'function' ? prototype.values
    : typeof prototype[Symbol.asyncIterator] === 'function' ? prototype[Symbol.asyncIterator] : values;
  if (typeof prototype.values !== 'function') {
    Object.defineProperty(prototype, 'values', { configurable: true, writable: true, value: iterate });
  }
  if (typeof prototype[Symbol.asyncIterator] !== 'function') {
    Object.defineProperty(prototype, Symbol.asyncIterator, { configurable: true, writable: true, value: iterate });
  }
}
