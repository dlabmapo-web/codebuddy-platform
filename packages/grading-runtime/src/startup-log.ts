import { open } from 'node:fs/promises';

/** Trusted supervisor setup diagnostics only; never sent in a learner response. */
export async function readStartupLog(path: string): Promise<string> {
  try {
    const file = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(8192);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      return buffer.subarray(0, bytesRead).toString('utf8');
    } finally { await file.close(); }
  } catch (error) {
    return `<unavailable: ${(error as NodeJS.ErrnoException).code ?? 'IO_ERROR'}>`;
  }
}
