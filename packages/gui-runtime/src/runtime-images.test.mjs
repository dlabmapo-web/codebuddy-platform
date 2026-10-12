import test from 'node:test';
import assert from 'node:assert/strict';
import { runtimeImages, selectRuntimeImage } from './runtime-images.mjs';
const current = `ghcr.io/acme/gui@sha256:${'a'.repeat(64)}`;
const previous = `ghcr.io/acme/gui@sha256:${'b'.repeat(64)}`;
test('only approved pinned registry images enter the production runtime registry', () => {
  assert.deepEqual(runtimeImages(current, `${previous},${current}`, true), [current, previous]);
  assert.throws(() => runtimeImages(current, 'arbitrary:latest', true), /approved registry digests/);
});
test('old lessons and submitted snapshots run their exact approved runtime after an upgrade', () => {
  const versions = new Map([['new;python=3.12;tk=8.6', 'new-image'], ['old;python=3.12;tk=8.6', 'old-image']]);
  assert.equal(selectRuntimeImage(versions, 'new;python=3.12;tk=8.6'), 'new-image');
  assert.equal(selectRuntimeImage(versions, 'new;python=3.12;tk=8.6', 'old;python=3.12;tk=8.6'), 'old-image');
  assert.throws(() => selectRuntimeImage(versions, 'new;python=3.12;tk=8.6', 'unapproved-image'), (e) => e.status === 503);
});
test('retention cannot grow without an operator review', () => {
  const retained = Array.from({length: 17}, (_, i) => `ghcr.io/acme/gui@sha256:${i.toString(16).padStart(64, '0')}`).join(',');
  assert.throws(() => runtimeImages(current, retained, true), /retention/);
});
