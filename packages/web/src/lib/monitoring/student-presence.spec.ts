import { describe, expect, it } from 'vitest';

import {
  LEARNING_ACTIVITY_EVENTS,
  isPlayingMedia,
} from './student-activity';

describe('student learning activity signals', () => {
  it('covers pointer, keyboard, and reading navigation input', () => {
    expect(LEARNING_ACTIVITY_EVENTS).toEqual([
      'pointerdown',
      'pointermove',
      'keydown',
      'scroll',
      'wheel',
      'touchstart',
    ]);
  });

  it('counts only media that is still playing', () => {
    expect(isPlayingMedia({ paused: false, ended: false })).toBe(true);
    expect(isPlayingMedia({ paused: true, ended: false })).toBe(false);
    expect(isPlayingMedia({ paused: false, ended: true })).toBe(false);
  });
});
