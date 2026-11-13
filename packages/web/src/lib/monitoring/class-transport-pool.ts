import type { Socket } from 'socket.io-client';

export type MonitoringChannel = 'class' | 'observation' | 'workspace';

/** A bounded set of transports owned by one mounted class workspace. */
export class ClassTransportPool {
  private readonly sockets = new Map<MonitoringChannel, Promise<Socket>>();
  private closed = false;
  constructor(private readonly create: () => Promise<Socket>) {}

  get(channel: MonitoringChannel): Promise<Socket> {
    if (this.closed) return Promise.reject(new Error('Class workspace closed'));
    const existing = this.sockets.get(channel);
    if (existing) return existing;
    const pending = this.create().catch(error => {
      if (this.sockets.get(channel) === pending) this.sockets.delete(channel);
      throw error;
    });
    this.sockets.set(channel, pending);
    return pending;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.sockets.values()) void pending.then(socket => socket.close(), () => undefined);
    this.sockets.clear();
  }
}
