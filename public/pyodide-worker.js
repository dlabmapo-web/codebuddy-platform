/* Pyodide 실행 워커: SharedArrayBuffer + Atomics 로 블로킹 stdin 을 구현해
   input() 호출 시 Python 실행을 일시정지하고 메인 스레드의 터미널 입력을 기다린다. */

// COEP(cross-origin isolated) 환경에서는 교차 출처 importScripts 가 차단되므로
// Pyodide 를 같은 출처(public/pyodide)에서 서빙한다.
const PYODIDE_BASE = '/pyodide/';
const PYODIDE_CDN = PYODIDE_BASE + 'pyodide.js';

let pyodide = null;
// control[0]: state (0=대기, 1=입력준비됨), control[1]: 입력 바이트 길이, control[2]: EOF 플래그
let control = null;
let dataBuf = null;
const decoder = new TextDecoder();
const stdoutDecoder = new TextDecoder();
const stderrDecoder = new TextDecoder();

function streamOutput(type, outputDecoder, buffer) {
  const text = outputDecoder.decode(buffer, { stream: true });
  if (text) self.postMessage({ type, text });
  return buffer.length;
}

function flushOutput(type, outputDecoder) {
  const text = outputDecoder.decode();
  if (text) self.postMessage({ type, text });
}

function readStdin() {
  // 메인 스레드에 입력을 요청하고, 값이 채워질 때까지 워커 스레드를 블로킹
  Atomics.store(control, 0, 0);
  Atomics.store(control, 2, 0);
  self.postMessage({ type: 'stdin' });
  Atomics.wait(control, 0, 0);

  if (Atomics.load(control, 2) === 1) return undefined; // EOF (사용자 중단)
  const len = Atomics.load(control, 1);
  if (len <= 0) return '';
  const bytes = dataBuf.slice(0, len);
  // autoEOF:true 모드에서는 한 번의 호출이 곧 한 줄(EOF 자동 삽입)이므로
  // 끝의 개행은 제거해 라인이 정확히 한 줄로 처리되게 한다.
  return decoder.decode(bytes).replace(/\r?\n$/, '');
}

async function initPyodide() {
  importScripts(PYODIDE_CDN);
  // worker(importScripts) 환경에서는 indexURL 자동 감지가 안 되므로 명시한다
  // eslint-disable-next-line no-undef
  pyodide = await loadPyodide({ indexURL: PYODIDE_BASE });
  pyodide.setStdout({ write: (buffer) => streamOutput('stdout', stdoutDecoder, buffer) });
  pyodide.setStderr({ write: (buffer) => streamOutput('stderr', stderrDecoder, buffer) });
  // autoEOF:true → stdin() 한 번 호출이 input() 한 줄에 대응 (라인 기반 입력)
  pyodide.setStdin({ stdin: readStdin, autoEOF: true });
  self.postMessage({ type: 'ready' });
}

self.onmessage = async (e) => {
  const msg = e.data;

  if (msg.type === 'init') {
    control = new Int32Array(msg.control);
    dataBuf = new Uint8Array(msg.data);
    try {
      await initPyodide();
    } catch (err) {
      self.postMessage({ type: 'fatal', text: err && err.message ? err.message : String(err) });
    }
    return;
  }

  if (msg.type === 'run') {
    if (!pyodide) {
      self.postMessage({ type: 'stderr', text: '실행 환경이 아직 준비되지 않았습니다.\n' });
      self.postMessage({ type: 'done' });
      return;
    }
    try {
      pyodide.globals.set('_cove_source', msg.code);
      const errorJson = await pyodide.runPythonAsync(`
import json as _cove_json
import linecache as _cove_linecache
import traceback as _cove_traceback

_cove_error = None
try:
    _cove_linecache.cache['solution.py'] = (
        len(_cove_source),
        None,
        _cove_source.splitlines(True),
        'solution.py',
    )
    exec(compile(_cove_source, 'solution.py', 'exec'), {'__name__': '__main__'})
except BaseException as _cove_exc:
    _cove_type = type(_cove_exc).__name__
    _cove_message = str(_cove_exc)
    _cove_line = getattr(_cove_exc, 'lineno', None)
    _cove_offset = getattr(_cove_exc, 'offset', None)

    if isinstance(_cove_exc, SyntaxError):
        _cove_display = ''.join(
            _cove_traceback.format_exception_only(type(_cove_exc), _cove_exc)
        )
    else:
        _cove_frames = [
            _frame for _frame in _cove_traceback.extract_tb(_cove_exc.__traceback__)
            if _frame.filename == 'solution.py'
        ]
        if _cove_frames:
            _cove_line = _cove_frames[-1].lineno
        _cove_display = (
            'Traceback (most recent call last):\\n'
            + ''.join(_cove_traceback.format_list(_cove_frames))
            + ''.join(_cove_traceback.format_exception_only(type(_cove_exc), _cove_exc))
        )

    _cove_error = _cove_json.dumps({
        'type': _cove_type,
        'message': _cove_message,
        'line': _cove_line,
        'offset': _cove_offset,
        'display': _cove_display,
    }, ensure_ascii=False)

_cove_error
`);
      if (errorJson) {
        self.postMessage({ type: 'pythonError', error: JSON.parse(errorJson) });
      }
    } catch (err) {
      // 실행기 자체의 오류만 fatal 로 전달한다. 학생 코드 오류는 위 pythonError 로 분리된다.
      const text = err && err.message ? err.message : String(err);
      self.postMessage({ type: 'fatal', text });
    }
    flushOutput('stdout', stdoutDecoder);
    flushOutput('stderr', stderrDecoder);
    self.postMessage({ type: 'done' });
  }
};
