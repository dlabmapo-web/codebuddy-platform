// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';

import { pointDirection, visibleSurfaceBox } from './surfaces';

describe('visibleSurfaceBox (statement scrolled under its pane)', () => {
  it('clips a tall surface to its scroll container, so text scrolled past is "below"', () => {
    const pane = document.createElement('section');
    pane.style.overflowY = 'auto';
    const surface = document.createElement('div');
    pane.append(surface);
    document.body.append(pane);
    pane.getBoundingClientRect = () => ({ left: 288, top: 109, width: 712, height: 557 } as DOMRect);
    surface.getBoundingClientRect = () => ({ left: 288, top: 109, width: 712, height: 1133 } as DOMRect);

    const visible = visibleSurfaceBox(surface);
    expect(visible.top).toBe(109);
    expect(visible.height).toBe(557);
    // Inside the content box but under the lesson bar: not drawable here.
    expect(pointDirection({ left: 640, top: 687 }, visible)).toBe('below');
    expect(pointDirection({ left: 640, top: 600 }, visible)).toBeNull();
    pane.remove();
  });
});
