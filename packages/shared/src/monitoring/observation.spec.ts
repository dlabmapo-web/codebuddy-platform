import { describe, it, expect } from 'vitest';
import { observationWorkSchema } from './observation.js';
describe('student observation boundary', () => {
  it('preserves intentionally cleared answers, choices and drawings', () => {
    expect(observationWorkSchema.parse({ answer: '', choices: [], drawing: null })).toEqual({ answer: '', choices: [], drawing: null });
  });
  it('rejects executable or external drawing content', () => {
    for (const drawing of ['data:image/svg+xml;base64,PHN2Zz4=', 'https://example.test/drawing.png', 'javascript:alert(1)'])
      expect(observationWorkSchema.safeParse({ drawing }).success).toBe(false);
  });
  it('bounds source, output and playback positions', () => {
    expect(observationWorkSchema.safeParse({ files: { '../escape.py': 'pass' } }).success).toBe(false);
    expect(observationWorkSchema.safeParse({ output: 'x'.repeat(64001) }).success).toBe(false);
    expect(observationWorkSchema.safeParse({ videoPosition: Infinity }).success).toBe(false);
    expect(observationWorkSchema.safeParse({ pdfPage: 0 }).success).toBe(false);
  });
  it('has no channel for hidden answers, actor identity or writes', () => {
    for (const field of ['correctOptionIds', 'expectedAnswer', 'studentMembershipId', 'submit', 'edit'])
      expect(observationWorkSchema.safeParse({ [field]: true }).success).toBe(false);
  });
});
