import { describe, expect, it, vi } from 'vitest';
import { ensureReadableStreamIterator, type IterableReadableStream } from './readable-stream-iterator';

function safariStream<T>(source: UnderlyingDefaultSource<T>) {
  class ReaderOnlyStream<R> extends ReadableStream<R> {}
  Object.defineProperties(ReaderOnlyStream.prototype, {
    values: { configurable: true, value: undefined },
    [Symbol.asyncIterator]: { configurable: true, value: undefined },
  });
  ensureReadableStreamIterator(ReaderOnlyStream);
  return new ReaderOnlyStream<T>(source) as IterableReadableStream<T>;
}

describe('PDF stream iteration compatibility', () => {
  it('reads every chunk and releases the reader on completion', async () => {
    const cancel = vi.fn();
    const stream = safariStream<string>({ start(c) { c.enqueue('one'); c.enqueue('two'); c.close(); }, cancel });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    expect(chunks).toEqual(['one', 'two']);
    expect(stream.locked).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });
  it('cancels and releases when a consumer stops early, including before its first read', async () => {
    const cancel = vi.fn();
    const stream = safariStream<string>({ start(c) { c.enqueue('one'); }, cancel });
    const iterator = stream.values();
    expect(stream.locked).toBe(true);
    await iterator.return!('finished');
    expect(cancel).toHaveBeenCalledWith('finished');
    expect(stream.locked).toBe(false);
  });
  it('keeps the remaining data when preventCancel is requested', async () => {
    const stream = safariStream<number>({ start(c) { c.enqueue(1); c.enqueue(2); c.close(); } });
    for await (const chunk of stream.values({ preventCancel: true })) { expect(chunk).toBe(1); break; }
    const reader = stream.getReader();
    expect(await reader.read()).toEqual({ value: 2, done: false });
    reader.releaseLock();
  });
  it('releases a failed stream and preserves the failure', async () => {
    const error = new Error('broken PDF stream');
    const stream = safariStream({ start(c) { c.error(error); } });
    await expect(stream.values().next()).rejects.toBe(error);
    expect(stream.locked).toBe(false);
  });
  it('leaves native implementations unchanged', () => {
    const prototype = ReadableStream.prototype as Partial<IterableReadableStream<unknown>>;
    const native = prototype[Symbol.asyncIterator];
    ensureReadableStreamIterator();
    expect(prototype[Symbol.asyncIterator]).toBe(native);
  });
});
