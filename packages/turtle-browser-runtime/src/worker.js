/* Classic dedicated worker. Served with its own deny-network/nested-worker CSP. */
self.postMessage({ version: 1, kind: 'prepare-stage', stage: 'worker-start', ms: 0 });
// Deny persistent/shared-origin channels before the engine can retain native
// references. Cross-origin separation/CSP remain the authority/network boundary.
function removeCapability(target, name) {
  for (let owner = target; owner; owner = Object.getPrototypeOf(owner)) {
    if (!Object.hasOwn(owner, name)) continue;
    if (!Object.getOwnPropertyDescriptor(owner, name).configurable || !Reflect.deleteProperty(owner, name)) throw new Error('Unable to isolate local storage capability');
  }
  Object.defineProperty(target, name, { value: undefined, writable: false, configurable: false });
}
for (const name of ['indexedDB', 'caches', 'BroadcastChannel', 'SharedWorker']) removeCapability(self, name);
for (const name of ['storage', 'serviceWorker']) removeCapability(navigator, name);
async function bootstrap() {
  if (self.location.hostname === '127.0.0.1') {
    await new Promise((resolve, reject) => {
      const child = new Worker(new URL('./worker.js?csp-child-probe=1', self.location.href));
      const timer = setTimeout(() => { child.terminate(); reject(new Error('Nested-worker policy not confirmed')); }, 1000);
      child.onerror = event => { event.preventDefault(); clearTimeout(timer); child.terminate(); resolve(); };
      child.onmessage = () => { clearTimeout(timer); child.terminate(); reject(new Error('Nested worker escaped CSP')); };
    });
    self.postMessage({ version: 1, kind: 'prepare-stage', stage: 'nestedWorkerDenied', ms: 1 });
  }
const loadStarted = performance.now();
importScripts('./brython.js', './brython_stdlib.js', './modules.js');
self.postMessage({ version: 1, kind: 'prepare-stage', stage: 'assets', ms: performance.now() - loadStarted });
__BRYTHON__.brython({ debug: 0, indexedDB: false, cache: false });
let used = false;
__BRYTHON__.runPythonSource(`
import sys as _sys
import builtins as _builtins
from browser import self as _self
_t0 = _self.performance.now()
import turtle as _t
_self.send({'version': 1, 'kind': 'prepare-stage', 'stage': 'turtle', 'ms': _self.performance.now() - _t0})
_t0 = _self.performance.now()
import custom, shape, math, random
_self.send({'version': 1, 'kind': 'prepare-stage', 'stage': 'helpers_random', 'ms': _self.performance.now() - _t0})

_generation = ''
_sequence = 0
def _send(events):
    global _sequence
    # Small batches keep the serialized UTF-8 message below the protocol cap.
    batch = []
    size = 0
    for event in events:
        event_size = len(str(event).encode('utf-8')) + 64
        if batch and size + event_size > 56000:
            _self.send({'version': 1, 'kind': 'events', 'generation': _generation, 'sequence': _sequence, 'events': batch})
            _sequence += 1
            batch = []
            size = 0
        batch.append(event)
        size += event_size
    if batch:
        _self.send({'version': 1, 'kind': 'events', 'generation': _generation, 'sequence': _sequence, 'events': batch})
        _sequence += 1
_t._sink = _send
class _Output:
    def write(self, value):
        _t._output(str(value))
        return len(value)
    def flush(self): _t._flush()
_sys.stdout = _Output()
_sys.stderr = _Output()
def _no_input(*args, **kwargs):
    raise _t.UnsupportedFeature('input() requires full Python')
_builtins.input = _no_input
_original_import = _builtins.__import__
def _import(name, *args, **kwargs):
    if name.split('.')[0] not in ('turtle', 'custom', 'shape', 'math', 'random'):
        raise _t.UnsupportedFeature('Import ' + name + ' requires full Python')
    return _original_import(name, *args, **kwargs)

def execute(source, generation):
    global _generation
    _generation = generation
    _builtins.__import__ = _import
    kind, message = 'complete', ''
    try:
        exec(source, {'__name__': '__main__', '__file__': 'main.py'})
    except _t.UnsupportedFeature as error:
        kind, message = 'unsupported', str(error)
    except BaseException as error:
        _builtins.__import__ = _original_import
        kind = 'failed'
        line = getattr(error, 'lineno', None)
        tb = error.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename in ('main.py', '<string>'): line = tb.tb_lineno
            tb = tb.tb_next
        message = ('File "main.py", line ' + str(line) + ': ' if line is not None else '') + type(error).__name__ + ': ' + str(error)
    finally:
        _builtins.__import__ = _original_import
        _t._flush()
    _self.send({'version': 1, 'kind': kind, 'generation': generation, 'message': message[:2000]})
`, { id: '_cove_runner' });
const runner = __BRYTHON__.getPythonModule('_cove_runner');
const execute = __BRYTHON__.$getattr(runner, 'execute');
self.postMessage({ version: 1, kind: 'ready' });
self.onmessage = event => {
  const data = event.data;
  if (used || !data || data.version !== 1 || data.kind !== 'run' ||
      typeof data.source !== 'string' || new TextEncoder().encode(data.source).length > 65536 ||
      typeof data.generation !== 'string' || !/^[\da-f-]{36}$/i.test(data.generation)) return;
  used = true;
  __BRYTHON__.$call(execute, data.source, data.generation);
};

}
bootstrap().catch(() => self.postMessage({ version: 1, kind: 'bootstrap-failed', message: 'Python bootstrap or isolation check failed' }));
