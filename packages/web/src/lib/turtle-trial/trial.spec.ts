import { describe, expect, it } from 'vitest';
import { trialAllowedPath, trialBody, trialBrowserBody, trialCookieName, trialOriginAllowed } from './boundary';
import { parseTurtleDraft, initialTurtleDraft, turtleErrorHint } from './drafts';

describe('public turtle browser boundary', () => {
  it('restricts forwarding to explicit trial actions and exact origins', () => {
    expect(trialAllowedPath('runs/../../manual', 'GET')).toBe(false);
    expect(trialAllowedPath('bootstrap', 'POST')).toBe(false);
    expect(trialAllowedPath('access', 'POST')).toBe(true);
    const headers = new Headers({ origin: 'https://cs.coveedu.com', 'x-cove-turtle': '1', 'sec-fetch-site': 'same-origin' });
    expect(trialOriginAllowed(headers, 'https://cs.coveedu.com')).toBe(true);
    headers.set('origin', 'https://evil.example'); expect(trialOriginAllowed(headers, 'https://cs.coveedu.com')).toBe(false);
    expect(trialCookieName(true)).toBe('__Host-cove-turtle');
    expect(trialCookieName(false, true)).toBe('cove-turtle-browser-fixture');
    expect(trialCookieName(true, true)).toBe('__Host-cove-turtle');
  });
  it('rejects source/output and arbitrary bodies before browser metadata reaches the API', () => {
    const metadata = { requestKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', sourceHash: 'a'.repeat(64), starterId: 'drawing', helperVersion: 'cove-trial-v1', profile: 'cove-browser-turtle-v1' };
    expect(() => trialBrowserBody('browser-runs', JSON.stringify(metadata))).not.toThrow();
    expect(() => trialBrowserBody('browser-runs', JSON.stringify({ ...metadata, source: 'private' }))).toThrow('INVALID_REQUEST');
    expect(() => trialBrowserBody('browser-runs/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/renew', '{"output":"private"}')).toThrow('INVALID_REQUEST');
    expect(trialAllowedPath('browser-runs/../../project', 'POST')).toBe(false);
  });
  it('bounds streamed request bodies even without Content-Length', async () => {
    const stream = new ReadableStream({ start(c) { c.enqueue(new Uint8Array(98305)); c.close(); } });
    const request = new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: stream, duplex: 'half' } as RequestInit);
    await expect(trialBody(request)).rejects.toThrow('SOURCE_TOO_LARGE');
    expect(await trialBody(new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"pin":"012345"}' }))).toBe('{"pin":"012345"}');
  });
  it('restores per-starter code and rejects malformed or oversized local drafts', () => {
    const d = initialTurtleDraft(); d.buffers.race += 'BlueForward(20)\n';
    expect(parseTurtleDraft(JSON.stringify(d))).toEqual(d);
    expect(parseTurtleDraft('{broken')).toEqual(initialTurtleDraft());
    expect(parseTurtleDraft(JSON.stringify({ ...d, font: 999 }))).toEqual(initialTurtleDraft());
    expect(parseTurtleDraft(JSON.stringify({ ...d, buffers: { ...d.buffers, race: 'x'.repeat(65537) } }))).toEqual(initialTurtleDraft());
  });
  it('locates the editable caller without exposing helper internals as the failing line', () => {
    const output = 'File "/work/main.py", line 7\nFile "/work/custom.py", line 25\nRuntimeError: Call ReadyToRace() first';
    expect(turtleErrorHint(output)).toMatchObject({ line: 7, key: 'hint_race' });
  });
});
