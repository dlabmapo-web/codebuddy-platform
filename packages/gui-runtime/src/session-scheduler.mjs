// A closed session retains its execution slot until container removal is confirmed.
export class SessionScheduler {
  constructor(sessions, capacity, launch, canDispatch = () => true) { Object.assign(this, { sessions, capacity, launch, canDispatch }); }
  get active() { return [...this.sessions.values()].filter(s => s.occupies).length; }
  dispatch() {
    if (!this.canDispatch()) return;
    for (const s of this.sessions.values()) {
      if (this.active >= this.capacity) break;
      if (s.closed || s.state !== 'QUEUED') continue;
      s.occupies = true;
      s.state = 'STARTING';
      s.launchTask = this.launch(s);
      s.launchTask.catch(() => {});
    }
  }
  release(s) { s.occupies = false; this.dispatch(); }
}
