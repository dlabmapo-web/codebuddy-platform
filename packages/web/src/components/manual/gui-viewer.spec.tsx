// @vitest-environment happy-dom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManualSession } from '@cove/shared';

const mocks = vi.hoisted(() => ({ load: vi.fn(), t: (key: string) => key }));
vi.mock('./novnc-loader', () => ({ loadRfb: mocks.load }));
vi.mock('./use-manual-translation', () => ({ useManualTranslation: () => ({ t: mocks.t }) }));
import { GuiViewer } from './gui-viewer';

class FakeSocket {
  static OPEN = 1;
  readyState = 1;
  close = vi.fn(() => { this.readyState = 3; });
}
class FakeRfb extends EventTarget {
  static instances: FakeRfb[] = [];
  closed = false;
  viewOnly = false;
  scaleViewport = false;
  resizeSession = false;
  background = '';
  blur() {}
  sendKey() {}
  disconnect = vi.fn(() => {
    // Mirror noVNC's terminal-state restriction, rather than silently allowing
    // a second disconnect and missing the development error overlay.
    if (this.closed) throw new Error('Tried changing state of a disconnected RFB object');
    this.peerDisconnect();
  });
  constructor(target: HTMLElement) {
    super();
    target.append(document.createElement('canvas'));
    FakeRfb.instances.push(this);
  }
  peerDisconnect() {
    this.closed = true;
    this.dispatchEvent(new Event('disconnect'));
  }
}
const session: ManualSession = {
  id: 'drawing-one', state: 'DISPLAYING', token: 'display-token', output: '',
  expiresAt: Date.now() + 120000, displayUrl: 'ws://localhost/display',
};
let host: HTMLDivElement;
let root: Root;
const onError = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('React', React);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,frame');
  FakeRfb.instances = [];
  mocks.load.mockResolvedValue(FakeRfb);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount()); host.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks();
});
const render = async (current = session) => {
  await act(async () => root.render(<GuiViewer session={current} minimal onError={onError} />));
};

describe('drawing viewer connection lifecycle', () => {
  it('unmounts safely after the server has already disconnected', async () => {
    await render();
    const remote = FakeRfb.instances[0]!;
    await act(() => remote.peerDisconnect());
    await act(() => root.unmount());
    await act(() => { vi.advanceTimersByTime(3000); });
    expect(remote.disconnect).not.toHaveBeenCalled();
    expect(FakeRfb.instances).toHaveLength(1);
  });

  it('disconnects a live viewer once when the session changes', async () => {
    await render();
    const first = FakeRfb.instances[0]!;
    await render({ ...session, id: 'drawing-two' });
    expect(first.disconnect).toHaveBeenCalledOnce();
    const second = FakeRfb.instances[1]!;
    await act(() => root.unmount());
    expect(second.disconnect).toHaveBeenCalledOnce();
  });

  it('reconnects after network loss and cleans up only the new connection', async () => {
    await render();
    const first = FakeRfb.instances[0]!;
    await act(() => first.peerDisconnect());
    await act(() => { vi.advanceTimersByTime(2000); });
    expect(FakeRfb.instances).toHaveLength(2);
    const second = FakeRfb.instances[1]!;
    await act(() => root.unmount());
    expect(first.disconnect).not.toHaveBeenCalled();
    expect(second.disconnect).toHaveBeenCalledOnce();
  });
});
