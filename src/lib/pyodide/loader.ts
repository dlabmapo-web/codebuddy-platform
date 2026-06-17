const PYODIDE_CDN = 'https://cdn.jsdelivr.net/pyodide/v0.27.5/full/pyodide.js';

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
    const script = document.createElement('script');
    script.src = PYODIDE_CDN;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Pyodide CDN 로드 실패'));
    document.head.appendChild(script);
  });

  // @ts-expect-error - loaded via CDN
  instance = await window.loadPyodide();
  return instance!;
}
