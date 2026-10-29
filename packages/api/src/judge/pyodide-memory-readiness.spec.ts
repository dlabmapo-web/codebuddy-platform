import { expect, it, vi } from 'vitest';
const memory = vi.hoisted(() => vi.fn(() => null));
vi.mock('./process-memory.js', () => ({ readProcessMemoryMb: memory }));
import { PyodideExecutionEngine } from './pyodide-engine.js';
it('refuses default-engine readiness before interpreter preparation when real memory telemetry is unavailable', async () => {
  const engine = new PyodideExecutionEngine('0.27.5', 1, 0);
  try {
    await expect(engine.warmUp()).rejects.toThrow('refusing readiness');
    expect(memory).toHaveBeenCalledWith(process.pid);
    expect(engine.diagnostics().warming).toBe(0);
  } finally { await engine.dispose(); }
});
