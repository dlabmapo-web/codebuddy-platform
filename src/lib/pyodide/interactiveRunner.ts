import type { PythonExecutionError } from './pythonError';

export type RunnerEvent =
  | { type: 'ready' }
  | { type: 'stdout'; text: string }
  | { type: 'stderr'; text: string }
  | { type: 'pythonError'; error: PythonExecutionError }
  | { type: 'stdin' }
  | { type: 'done' }
  | { type: 'fatal'; text: string };

type Listener = (event: RunnerEvent) => void;

const DATA_BYTES = 1 << 20; // 1MB 입력 버퍼

/** 대화식 실행에 필요한 SharedArrayBuffer(cross-origin isolated) 지원 여부 */
export function isInteractiveSupported(): boolean {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof Atomics !== 'undefined' &&
    typeof self !== 'undefined' &&
    self.crossOriginIsolated === true
  );
}

/**
 * Pyodide 워커를 관리하며, input() 호출 시 SharedArrayBuffer 로 워커를 블로킹했다가
 * 메인 스레드가 제공한 입력으로 재개시킨다.
 */
export class InteractiveRunner {
  private worker: Worker | null = null;
  private readonly controlSab: SharedArrayBuffer;
  private readonly dataSab: SharedArrayBuffer;
  private readonly control: Int32Array;
  private readonly dataBuf: Uint8Array;
  private readonly encoder = new TextEncoder();
  private readonly listeners = new Set<Listener>();

  private ready = false;
  private failed = false;
  private readyPromise!: Promise<void>;
  private resolveReady!: () => void;
  private running = false;

  constructor() {
    this.controlSab = new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT);
    this.dataSab = new SharedArrayBuffer(DATA_BYTES);
    this.control = new Int32Array(this.controlSab);
    this.dataBuf = new Uint8Array(this.dataSab);
    this.spawn();
  }

  private spawn() {
    this.readyPromise = new Promise<void>((resolve) => { this.resolveReady = resolve; });
    this.ready = false;
    this.failed = false;
    this.running = false;
    Atomics.store(this.control, 0, 0);
    Atomics.store(this.control, 1, 0);
    Atomics.store(this.control, 2, 0);
    this.worker = new Worker('/pyodide-worker.js?v=6');
    this.worker.onmessage = (e: MessageEvent<RunnerEvent>) => this.handle(e.data);
    this.worker.onerror = (e) => {
      const detail = e.message || (e.filename ? `${e.filename}:${e.lineno}` : '워커를 시작할 수 없습니다');
      this.handle({ type: 'fatal', text: `실행 환경 로드 실패: ${detail}` });
    };
    this.worker.onmessageerror = () => {
      this.handle({ type: 'fatal', text: '실행 환경 통신 오류가 발생했습니다.' });
    };
    this.worker.postMessage({ type: 'init', control: this.controlSab, data: this.dataSab });
  }

  private handle(msg: RunnerEvent) {
    if (msg.type === 'ready') {
      this.ready = true;
      this.resolveReady();
    }
    if (msg.type === 'fatal' && !this.ready) {
      // 준비 전에 치명적 오류 → 이 워커는 사용 불가 표시 (다음 실행 시 재생성)
      this.failed = true;
      this.resolveReady();
    }
    if (msg.type === 'done' || msg.type === 'fatal') {
      this.running = false;
    }
    this.listeners.forEach((l) => l(msg));
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get isReady() { return this.ready; }
  get isRunning() { return this.running; }
  get isFailed() { return this.failed; }

  /** 워커가 로드될 때까지 대기 */
  whenReady(): Promise<void> { return this.readyPromise; }

  async run(code: string): Promise<void> {
    await this.readyPromise;
    if (!this.worker) return;
    this.running = true;
    this.worker.postMessage({ type: 'run', code });
  }

  /** 워커가 stdin 을 기다리는 동안 한 줄을 제공하여 실행을 재개 */
  provideInput(line: string): void {
    const withNewline = line.endsWith('\n') ? line : line + '\n';
    const bytes = this.encoder.encode(withNewline);
    const len = Math.min(bytes.length, this.dataBuf.length);
    this.dataBuf.set(bytes.subarray(0, len));
    Atomics.store(this.control, 1, len);
    Atomics.store(this.control, 2, 0);
    Atomics.store(this.control, 0, 1);
    Atomics.notify(this.control, 0);
  }

  /** EOF(입력 종료) 신호 → Python 은 EOFError 를 받는다 */
  sendEOF(): void {
    Atomics.store(this.control, 2, 1);
    Atomics.store(this.control, 0, 1);
    Atomics.notify(this.control, 0);
  }

  /** 실행 강제 중단: 워커 종료 후 재생성 */
  stop(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.spawn();
  }

  dispose(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.listeners.clear();
  }
}
