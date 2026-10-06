/** Shared by authoring and the isolated sandbox; no runtime dependencies. */
export const gradingDataLimits = {
  testTextChars: 8 * 1024 * 1024,
  testSetChars: 16 * 1024 * 1024,
  stdoutBytes: 8 * 1024 * 1024,
  stderrBytes: 256 * 1024,
  codeChars: 100_000,
  comparatorBudgetMs: 1_000,
  // JSON can encode each character as six bytes; the sandbox frame must fit
  // that representation. Authoring also respects the existing edge body cap.
  sandboxFrameBytes: 64 * 1024 * 1024,
  authoringBodyBytes: 20_000_000,
} as const;
