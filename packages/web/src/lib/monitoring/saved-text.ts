/** Confirms visible text, including deletions, against the committed snapshot. */
export class SavedTextTracker {
  private generation = 0;

  constructor(
    private readonly read: () => string,
    private readonly report: (unsaved: boolean) => void,
  ) {}

  changed(): void {
    this.generation += 1;
    this.report(true);
  }

  cancel(): void {
    this.generation += 1;
  }

  async confirm(hash: string | undefined): Promise<void> {
    const generation = ++this.generation;
    const code = this.read();
    this.report(true);
    if (!hash) return; // Old servers cannot attest which text they saved.
    try {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
      const actual = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (generation === this.generation && this.read() === code) {
        this.report(actual !== hash);
      }
    } catch {
      // Missing crypto support must never turn uncertainty into Saved.
    }
  }
}
