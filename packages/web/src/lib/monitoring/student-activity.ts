/** Deliberate foreground input that can earn bounded learning time. */
export const LEARNING_ACTIVITY_EVENTS = [
  'pointerdown',
  'pointermove',
  'keydown',
  'scroll',
  'wheel',
  'touchstart',
] as const;

export function isPlayingMedia(media: {
  paused: boolean;
  ended: boolean;
}): boolean {
  return !media.paused && !media.ended;
}
