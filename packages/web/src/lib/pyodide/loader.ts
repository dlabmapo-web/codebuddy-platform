const PYODIDE_BASE = '/pyodide/';
const PYODIDE_SCRIPT = PYODIDE_BASE + 'pyodide.js';

type PyodideInstance = {
  runPythonAsync: (code: string) => Promise<unknown>;
  loadPackage: (pkg: string | string[]) => Promise<void>;
};

let instance: PyodideInstance | null = null;

export async function loadPyodide(): Promise<PyodideInstance> {
  if (instance) return instance;

  if (typeof window === 'undefined') {
    throw new Error('Pyodide는 브라우저에서만 로드할 수 있습니다.');
  }

  await new Promise<void>((resolve, reject) => {
    if ((window as { loadPyodide?: unknown }).loadPyodide) { resolve(); return; }
    const script = document.createElement('script');
    script.src = PYODIDE_SCRIPT;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Pyodide 로드 실패'));
    document.head.appendChild(script);
  });

  // @ts-expect-error - loaded via script tag
  instance = await window.loadPyodide({ indexURL: PYODIDE_BASE });
  return instance!;
}
