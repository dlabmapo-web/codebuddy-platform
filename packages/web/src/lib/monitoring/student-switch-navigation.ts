/** Fences asynchronous edit handoffs so only the latest requested destination opens. */
export class StudentSwitchNavigation {
  private generation = 0;

  cancel() { this.generation += 1; }

  async request(prepare: () => Promise<boolean>, navigate: () => void): Promise<'navigated' | 'failed' | 'cancelled'> {
    const generation = ++this.generation;
    const ready = await prepare();
    if (generation !== this.generation) return 'cancelled';
    if (!ready) return 'failed';
    navigate();
    return 'navigated';
  }
}
