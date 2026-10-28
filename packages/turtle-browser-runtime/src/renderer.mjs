import { encodedSize, eventCost, limits, validateBatch } from './protocol.mjs';

/** Trusted renderer. Programs provide primitives, never DOM/HTML or executable callbacks. */
export class DrawingRenderer {
  constructor(canvas, cursors, { output = () => {}, painted = () => {}, drained = () => {}, error = () => {} } = {}) {
    this.canvas = canvas; this.cursors = cursors;
    this.context = canvas.getContext('2d'); this.cursorContext = cursors.getContext('2d');
    this.snapshot = canvas.ownerDocument.createElement('canvas');
    this.snapshot.width = canvas.width; this.snapshot.height = canvas.height;
    this.snapshotContext = this.snapshot.getContext('2d');
    this.callbacks = { output, painted, drained, error };
    this.reset();
  }
  reset(generation = '') {
    this.stop(); this.generation = generation; this.sequence = 0;
    this.count = 0; this.paintWork = 0; this.bytes = 0; this.outputBytes = 0; this.queue = []; this.head = 0;
    this.log = []; this.pens = new Map(); this.background = 'white';
    this.world = [-512, -320, 512, 320]; this.tracing = 1; this.updates = 0;
    this.firstPaint = false; this.completed = false; this.repaint();
  }
  stop() {
    cancelAnimationFrame(this.frame); this.frame = 0; this.queue = []; this.head = 0; this.current = null; this.replay = null;
    this.generation = ''; this.completed = false;
  }
  accept(message) {
    if (message?.generation !== this.generation) return;
    if (!validateBatch(message, this.generation, this.sequence)) throw new Error('Invalid drawing message');
    this.sequence++; this.count += message.events.reduce((n, event) => n + eventCost(event), 0); this.bytes += encodedSize(message);
    if (this.count > limits.operations || this.bytes > limits.bytes) throw new Error('Drawing limit exceeded');
    for (const e of message.events) {
      if (e.op === 'output') { this.outputBytes += encodedSize(e.text); if (this.outputBytes > limits.output) throw new Error('Output limit exceeded'); }
      this.queue.push(e);
    }
    this.schedule();
  }
  complete() { this.completed = true; this.schedule(); }
  schedule() { if (!this.frame && this.generation) this.frame = requestAnimationFrame(t => this.tick(t)); }
  point(x, y) {
    const [left, bottom, right, top] = this.world;
    return [(x - left) * this.canvas.width / (right - left), (top - y) * this.canvas.height / (top - bottom)];
  }
  stroke(e, progress = 1) {
    this.charge(1);
    const c = this.context; const [x1, y1] = this.point(e.x1, e.y1);
    const [x2, y2] = this.point(e.x1 + (e.x2 - e.x1) * progress, e.y1 + (e.y2 - e.y1) * progress);
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2);
    c.strokeStyle = e.color; c.lineWidth = e.width || 1; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
    if (!this.firstPaint && (x1 !== x2 || y1 !== y2)) {
      this.firstPaint = true; const generation = this.generation;
      requestAnimationFrame(() => { if (this.generation === generation) this.callbacks.painted(generation); });
    }
  }
  primitive(e) {
    const c = this.context;
    if (e.op === 'line') this.stroke(e);
    else if (e.op === 'fill' && e.points.length) {
      this.charge(eventCost(e));
      c.beginPath(); e.points.forEach(([x, y], i) => { const p = this.point(x, y); if (i) c.lineTo(...p); else c.moveTo(...p); });
      c.closePath(); c.fillStyle = e.color; c.fill();
    } else if (e.op === 'text') {
      this.charge(eventCost(e));
      const [family, size, style] = e.font;
      c.font = `${style} ${size * 4 / 3}px ${family === 'DejaVu Sans' ? 'sans-serif' : family}`;
      c.textAlign = e.align; c.fillStyle = e.color; c.fillText(e.text, ...this.point(e.x, e.y));
    }
  }
  repaint() {
    const c = this.context; c.fillStyle = this.background; c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // Large clears/fills/world changes must remain interruptible. Replay the
    // retained scene in the same frame budget as new operations, never a
    // synchronous 50,000-item loop on the controller thread.
    this.replay = this.log.length ? { index: 0 } : null;
    if (this.replay) this.schedule(); else this.paintCursors();
  }
  paintCursors() {
    this.charge(this.pens.size);
    const c = this.cursorContext; c.clearRect(0, 0, this.cursors.width, this.cursors.height);
    for (const pen of this.pens.values()) {
      if (!pen.visible || pen.shape === 'blank') continue;
      c.save(); c.translate(...this.point(pen.x, pen.y)); c.rotate(-pen.heading * Math.PI / 180);
      c.scale(pen.sx, pen.sy); c.fillStyle = pen.color; c.strokeStyle = pen.color; c.lineWidth = 1;
      c.beginPath();
      if (pen.shape === 'circle') c.ellipse(0, 0, 5, 5, 0, 0, Math.PI * 2);
      else if (pen.shape === 'square') c.rect(-5, -5, 10, 10);
      else if (pen.shape === 'turtle') {
        c.ellipse(0, 0, 6, 4, 0, 0, Math.PI * 2); c.moveTo(7, 0); c.lineTo(10, 0);
        for (const side of [-1, 1]) { c.moveTo(-3, side * 3); c.lineTo(-5, side * 6); c.moveTo(3, side * 3); c.lineTo(5, side * 6); }
      } else { c.moveTo(9, 0); c.lineTo(-5, -5); c.lineTo(-2, 0); c.lineTo(-5, 5); c.closePath(); }
      c.fill(); c.stroke(); c.restore();
    }
  }
  charge(work) {
    this.paintWork += work;
    if (this.paintWork > limits.renderWork) throw new Error('Drawing render limit exceeded');
  }
  apply(e) {
    switch (e.op) {
      case 'clear': this.log = e.id === null ? [] : this.log.filter(p => p.id !== e.id); if (e.id === null) this.pens.clear(); if (this.tracing === 1) this.repaint(); break;
      case 'world': this.world = e.bounds; if (this.tracing === 1) this.repaint(); break;
      case 'background': this.background = e.color; if (this.tracing === 1) this.repaint(); break;
      case 'cursor': this.pens.set(e.id, e); if (this.tracing === 1) this.paintCursors(); else if (this.tracing > 1 && ++this.updates % this.tracing === 0) this.repaint(); break;
      case 'output': this.callbacks.output(e.text); break;
      case 'update': this.repaint(); break;
      case 'tracer': this.tracing = e.value; this.updates = 0; if (e.value) this.repaint(); break;
      case 'fill': {
        const i = this.log.findLastIndex(p => p.op === 'fillStart' && p.id === e.id);
        if (i < 0) throw new Error('Invalid fill sequence');
        this.log[i] = e; if (this.tracing === 1) this.repaint(); break;
      }
      default: this.log.push(e); if (this.tracing === 1) this.primitive(e);
    }
  }
  tick(time) {
    this.frame = 0; const began = performance.now();
    try {
      while ((this.replay || this.head < this.queue.length) && performance.now() - began < 6) {
        if (this.replay) {
          this.primitive(this.log[this.replay.index++]);
          if (this.replay.index === this.log.length) { this.replay = null; this.paintCursors(); }
          continue;
        }
        const e = this.queue[this.head];
        if (e.duration && this.tracing === 1) {
          if (!this.current) {
            // Keep the static scene on a reusable canvas. Synchronous CPU pixel
            // readback here delays the first teaching-animation stroke.
            this.snapshotContext.drawImage(this.canvas, 0, 0);
            this.current = { began: time, event: e };
          }
          const progress = Math.min(1, Math.max(0, (time - this.current.began) / e.duration));
          if (e.op === 'line') {
            this.context.drawImage(this.snapshot, 0, 0); this.stroke(e, progress);
            const pen = this.pens.get(e.id);
            if (pen) this.pens.set(e.id, { ...pen, x: e.x1 + (e.x2 - e.x1) * progress, y: e.y1 + (e.y2 - e.y1) * progress });
            this.paintCursors();
          }
          if (progress < 1) break;
          this.current = null;
        }
        this.head++; this.apply(e);
      }
      if (this.replay || this.head < this.queue.length) this.schedule();
      else {
        this.queue = []; this.head = 0;
        if (this.completed) { this.completed = false; this.callbacks.drained(this.generation); }
      }
    } catch (e) { this.stop(); this.callbacks.error(e.message); }
  }
}
