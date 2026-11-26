/**
 * Wakes this process's AI library job: a problem was just queued, so learning
 * starts within a second instead of at the job's next minute (the campus
 * courses design, §5). In process and dependency-free, so the content writers
 * need no module of the AI teacher; a process without the job ignores it.
 */
const listeners = new Set<() => void>();

export function wakeLibraryJob(): void {
  for (const listener of listeners) listener();
}

export function onLibraryWake(listener: () => void): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
