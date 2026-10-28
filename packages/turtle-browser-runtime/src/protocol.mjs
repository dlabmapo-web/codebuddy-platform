export const protocolVersion = 1;
export const limits = Object.freeze({ source: 65536, output: 262144, operations: 50000, renderWork: 800000, bytes: 8388608, batchBytes: 65536, batchOperations: 256, runMs: 120000 });
export const eventCost = event => event.op === 'fill' ? Math.max(1, event.points.length) : event.op === 'text' ? Math.max(1, event.text.length) : 1;
const fields = {
  line: ['id', 'x1', 'y1', 'x2', 'y2', 'color', 'width', 'duration'],
  cursor: ['id', 'x', 'y', 'heading', 'shape', 'sx', 'sy', 'color', 'visible', 'duration'],
  fillStart: ['id'], fill: ['id', 'points', 'color'],
  text: ['id', 'x', 'y', 'text', 'align', 'font', 'color'],
  clear: ['id'], background: ['color'], world: ['bounds'],
  output: ['text'], update: [], tracer: ['value'],
};
const numbers = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'heading']);
const positive = new Set(['width', 'duration', 'sx', 'sy', 'value']);
export const encodedSize = value => new TextEncoder().encode(typeof value === 'string' ? value : JSON.stringify(value)).length;
export const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1000000;
export const validColor = value => typeof value === 'string' && /^(?:#[\da-f]{3}|#[\da-f]{6}|[a-z]{1,24})$/i.test(value);
export function validateControl(message) {
  const fields = { run: ['generation', 'source', 'leaseUntil'], stop: ['generation', 'clear'], renew: ['generation', 'leaseUntil'], dispose: [] };
  if (!message || message.version !== 1 || !Object.hasOwn(fields, message.kind) || Object.keys(message).some(key => !['version', 'kind', ...fields[message.kind]].includes(key))) return false;
  const uuid = value => typeof value === 'string' && /^[\da-f-]{36}$/i.test(value);
  if (['run', 'renew'].includes(message.kind) && (!uuid(message.generation) || !Number.isFinite(message.leaseUntil))) return false;
  if (message.kind === 'stop' && ((message.generation !== undefined && !uuid(message.generation)) || (message.clear !== undefined && typeof message.clear !== 'boolean'))) return false;
  if (message.kind === 'run' && (typeof message.source !== 'string' || encodedSize(message.source) > limits.source)) return false;
  // JSON escaping can expand an otherwise valid 64 KiB source sixfold. Bound
  // raw source separately rather than rejecting programs with many newlines.
  try { return encodedSize(message) <= limits.source * 6 + 1024; } catch { return false; }
}
export function validateEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event) || !Object.hasOwn(fields, event.op)) return false;
  const required = fields[event.op];
  if (Object.keys(event).length !== required.length + 1 || required.some(key => !Object.hasOwn(event, key))) return false;
  for (const key of required) {
    const value = event[key];
    if (numbers.has(key) && !finite(value)) return false;
    if (positive.has(key) && (!finite(value) || value < 0 || (key === 'duration' && value > limits.runMs))) return false;
    if (key === 'id' && !(event.op === 'clear' && value === null) && (!Number.isSafeInteger(value) || value < 1 || value > limits.operations)) return false;
    if (key === 'color' && !validColor(value)) return false;
    if (key === 'text' && (typeof value !== 'string' || encodedSize(value) > 60000)) return false;
    if (event.op === 'text' && key === 'text' && [...value].length > 1024) return false;
    if (key === 'points' && (!Array.isArray(value) || value.length > 10000 || value.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(finite)))) return false;
    if (key === 'bounds' && (!Array.isArray(value) || value.length !== 4 || !value.every(finite) || value[2] - value[0] < 0.000001 || value[3] - value[1] < 0.000001)) return false;
    if (key === 'visible' && typeof value !== 'boolean') return false;
    if (key === 'shape' && !['classic', 'turtle', 'arrow', 'circle', 'square', 'triangle', 'blank'].includes(value)) return false;
    if (key === 'align' && !['left', 'center', 'right'].includes(value)) return false;
    if (key === 'font' && (!Array.isArray(value) || value.length !== 3 || !['Arial', 'DejaVu Sans', 'sans-serif', 'serif', 'monospace'].includes(value[0]) || !finite(value[1]) || value[1] < 1 || value[1] > 256 || !['normal', 'bold', 'italic'].includes(value[2]))) return false;
  }
  return true;
}
export function validateBatch(message, generation, nextSequence) {
  return !!message && message.version === protocolVersion && message.kind === 'events' &&
    message.generation === generation && message.sequence === nextSequence &&
    Object.keys(message).length === 5 && Array.isArray(message.events) &&
    message.events.length > 0 && message.events.length <= limits.batchOperations &&
    encodedSize(message) <= limits.batchBytes && message.events.every(validateEvent);
}
