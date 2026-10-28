const manifest = await (await fetch('/manifest.json')).json();
const surface = document.querySelector('#surface'), readiness = document.querySelector('#readiness');
const state = document.querySelector('#state'), results = document.querySelector('#results'), output = document.querySelector('#output');
const source = document.querySelector('#source');
const line = 'import turtle\nt = turtle.Turtle()\nt.speed(0)\nt.pencolor("#e11d48")\nt.forward(180)\nturtle.done()';
source.value = line;
let port, generation, began, prepared = false, preparationFailure = '', waitingReady = [], waitingPaint, waitingTerminal, lastPaint, stopBegan;
const samples = [], preparation = [];
function setReady(value) { prepared = value; for (const id of ['line', 'square', 'race', 'loop', 'unsupported', 'bench', 'helper-bench', 'run']) document.getElementById(id).disabled = !value; }
function send(data) { port.postMessage({ version: 1, ...data }); }
addEventListener('message', event => {
  if (event.source !== surface.contentWindow || event.origin !== manifest.runtimeOrigin || event.data?.kind !== 'cove-turtle-connect') return;
  const channel = new MessageChannel(); port = channel.port1;
  port.onmessage = event => {
    const m = event.data;
    if (m.kind === 'prepare-progress') { readiness.textContent = 'Preparing: ' + m.stage; return; }
    if (m.kind === 'ready') {
      preparation.push(m.preparationMs); readiness.textContent = `Clean worker ready (${m.preparationMs.toFixed(1)} ms) ${JSON.stringify(m.stages)}`; setReady(true);
      for (const waiter of waitingReady.splice(0)) waiter.resolve();
      return;
    }
    if (m.kind === 'prepare-failed') { preparationFailure = m.message; readiness.textContent = m.message + ' ' + JSON.stringify(m.stages); setReady(false); for (const waiter of waitingReady.splice(0)) waiter.reject(new Error(m.message)); return; }
    if (m.generation !== generation) return;
    if (m.kind === 'stopped' && stopBegan) { results.textContent = JSON.stringify({ stopMs: performance.now() - stopBegan }); stopBegan = 0; }
    if (m.kind === 'painted') { const ms = performance.now() - began; samples.push(ms); state.textContent = `First stroke: ${ms.toFixed(1)} ms`; waitingPaint?.(ms); waitingPaint = null; }
    else if (m.kind === 'output') output.textContent += m.text;
    else { state.textContent = m.kind + (m.message ? ': ' + m.message : ''); if (['displaying', 'failed', 'unsupported', 'stopped', 'lease-expired', 'timed-out'].includes(m.kind)) { waitingTerminal?.(m); waitingTerminal = null; } }
  };
  surface.contentWindow.postMessage({ version: 1, kind: 'connect' }, manifest.runtimeOrigin, [channel.port2]);
});
surface.src = `${manifest.runtimeOrigin}/${manifest.id}/index.html`;
function ready() { return preparationFailure ? Promise.reject(new Error(preparationFailure)) : prepared ? Promise.resolve() : new Promise((resolve, reject) => waitingReady.push({ resolve, reject })); }
async function run(code) {
  await ready(); setReady(false); generation = crypto.randomUUID(); output.textContent = '';
  const done = new Promise(resolve => { waitingTerminal = resolve; });
  lastPaint = new Promise(resolve => { waitingPaint = resolve; });
  began = performance.now(); send({ kind: 'run', generation, source: code, leaseUntil: Date.now() + 30000 }); return done;
}
document.querySelector('#run').onclick = () => { void run(source.value); };
document.querySelector('#line').onclick = () => { source.value = line; void run(source.value); };
document.querySelector('#square').onclick = () => { source.value = 'from custom import *\nfor i in range(4):\n    TForward(100)\n    TLeft(90)'; void run(source.value); };
document.querySelector('#race').onclick = () => { source.value = 'from custom import *\nReadyToRace()\nBlueForward(70)\nPinkForward(30)\nprint(BlueX(), PinkX())'; void run(source.value); };
document.querySelector('#loop').onclick = () => { source.value = 'while True: pass'; void run(source.value); };
document.querySelector('#unsupported').onclick = () => { source.value = 'input("name")'; void run(source.value); };
document.querySelector('#stop').onclick = () => { stopBegan = performance.now(); send({ kind: 'stop', generation }); };
document.querySelector('#clear').onclick = () => send({ kind: 'stop', generation, clear: true });
async function benchmark(program, fixture) {
  const start = samples.length, first = performance.now();
  try {
  for (let i = 0; i < 100; i++) {
    source.value = program.replace('#e11d48', i % 2 ? '#2563eb' : '#e11d48');
    const result = await run(source.value);
    if (result.kind !== 'displaying') { results.textContent = JSON.stringify({ failedAt: i, result }); return; }
    await lastPaint;
    results.textContent = `Completed ${i + 1}/100 prepared runs`;
  }
  await ready(); // Include the final replacement spare in preparation evidence.
  const values = samples.slice(start).sort((a, b) => a - b);
  results.textContent = JSON.stringify({ fixture, runtimeId: manifest.id, boundary: 'local dispatch to renderer stroke then next animation frame; excludes API admission', n: values.length, p50: values[49], p95: values[94], max: values.at(-1), elapsedMs: performance.now() - first, rawStrokeMs: samples.slice(start), preparation }, null, 2);
  } catch (error) { results.textContent = JSON.stringify({ failed: String(error), rawStrokeMs: samples.slice(start), preparation }); }
}
document.querySelector('#bench').onclick = () => benchmark(line, 'standard-turtle-colored-line-speed-0');
document.querySelector('#helper-bench').onclick = () => benchmark('from custom import *\nspeed(0)\ncolor("#e11d48")\nTForward(100)', 'custom-helper-colored-line-speed-0');
addEventListener('pagehide', () => { if (port) send({ kind: 'dispose' }); });
