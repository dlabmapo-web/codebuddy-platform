export type FeedbackDraft = { text: string; saved: string };
export function feedbackScope(teacher: string | null, academy: string, classId: string, student: string, material: string | null): string {
  return JSON.stringify([teacher, academy, classId, student, material]);
}
export class FeedbackDraftStore {
  private drafts = new Map<string, FeedbackDraft>();
  read(key: string) { return this.drafts.get(key)?.text ?? ''; }
  edit(key: string, text: string) {
    this.drafts.set(key, { text, saved: this.drafts.get(key)?.saved ?? '' });
  }
  hydrate(key: string, saved: string) {
    const old = this.drafts.get(key);
    if (!old || old.text === old.saved || old.text.trim() === saved.trim()) {
      this.drafts.set(key, { text: old?.text.trim() === saved.trim() ? old.text : saved, saved });
    }
  }
  acknowledge(key: string, sent: string) {
    const old = this.drafts.get(key);
    if (old) this.drafts.set(key, { text: old.text, saved: sent });
  }
  get dirty() { return [...this.drafts.values()].some(({ text, saved }) => text.trim() !== saved.trim()); }
  clear() { this.drafts.clear(); }
}
