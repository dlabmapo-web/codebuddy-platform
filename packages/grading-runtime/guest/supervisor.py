"""Trusted PID 1: separate control, bounded OS output, one disposable child."""
import json
import os
import selectors
import signal
import socket
import subprocess
import sys
import time

MAX_FRAME = 64 * 1024 * 1024
MiB = 1024 * 1024


def read_frame():
    line = sys.stdin.buffer.readline(MAX_FRAME + 1)
    if not line.endswith(b"\n") or len(line) > MAX_FRAME:
        raise RuntimeError("invalid broker frame")
    return json.loads(line)


def send(value):
    sys.stdout.write(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n")
    sys.stdout.flush()


def charged(pid):
    with open(f"/proc/{pid}/status", encoding="ascii") as source:
        values = dict(line.split(":", 1) for line in source if ":" in line)
    return (int(values["VmRSS"].split()[0]) + int(values["VmSwap"].split()[0])) * 1024


def decoded_capture(value, limit):
    encoded = bytes(value).decode("utf-8", errors="replace").encode("utf-8")
    return encoded[:limit].decode("utf-8", errors="ignore"), len(encoded) > limit


def bounded_text(value, limit):
    return decoded_capture(value, limit)[0]


def main():
    engine = os.environ["COVE_ENGINE"]
    with open("/opt/guest/identity.json", encoding="utf-8") as source:
        identity = json.load(source)
    if identity["engine"] != engine:
        raise RuntimeError("image engine mismatch")
    parent, child_socket = socket.socketpair()
    # subprocess preexec runs trusted code only; no interpreter is the learner yet.
    def child_setup():
        os.dup2(child_socket.fileno(), 3)
    child = subprocess.Popen(["/opt/guest/gated-launcher", engine], stdin=subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                             pass_fds=(child_socket.fileno(), 3), preexec_fn=child_setup,
                             env={"PATH": "/usr/local/bin:/usr/bin:/bin", "HOME": "/tmp", "LANG": "C.UTF-8"},
                             start_new_session=True)
    child_socket.close()
    send({"type": "GATED", "pid": child.pid})
    if read_frame() != {"type": "INIT"}:
        raise RuntimeError("missing initialization authorization")
    parent.sendall(b"I")
    parent.settimeout(30)
    ready = b""
    while not ready.endswith(b"\n"):
        ready += parent.recv(64)
        if len(ready) > 64 or not ready:
            raise RuntimeError("invalid learner readiness")
    if ready != b"READY\n":
        raise RuntimeError("invalid learner readiness")
    baseline = charged(child.pid)  # Compatibility only; native enforcement is host cgroup.
    send({"type": "READY", **identity})
    request = read_frame()
    if request.get("type") != "RUN":
        raise RuntimeError("missing execution authorization")
    job = request["input"]
    limit = job["outputLimitBytes"]
    captures = {"stdout": bytearray(), "stderr": bytearray()}
    caps = {"stdout": limit, "stderr": 256 * 1024}
    truncated = False
    timed_out = False
    memory_limit = False
    blind = 0
    sel = selectors.DefaultSelector()
    for stream, key in ((child.stdout, "stdout"), (child.stderr, "stderr")):
        os.set_blocking(stream.fileno(), False)
        sel.register(stream, selectors.EVENT_READ, key)
    # Nonblocking delivery prevents unconsumed large stdin/source from stalling supervision.
    payload = (json.dumps({k: job[k] for k in ("code", "stdin", "inputPromptPolicy")},
                          ensure_ascii=True, separators=(",", ":")) + "\n").encode("utf-8")
    parent.setblocking(False)
    sel.register(parent, selectors.EVENT_WRITE, "delivery")
    sent = 0
    started = time.monotonic()
    sample_at = started + .1
    exited_at = None
    runtime_ms = None
    while sel.get_map() or child.poll() is None:
        now = time.monotonic()
        alive = child.poll() is None
        if alive and now - started >= job["timeLimitMs"] / 1000 and not timed_out:
            timed_out = True
            os.killpg(child.pid, signal.SIGKILL)
        if alive and engine == "pyodide" and now >= sample_at and not timed_out:
            sample_at = now + .1
            try:
                growth = charged(child.pid) - baseline
                blind = 0
                if growth > job["memoryLimitMb"] * MiB:
                    memory_limit = True
                    os.killpg(child.pid, signal.SIGKILL)
            except (OSError, KeyError, ValueError):
                blind += 1
                if blind >= 5:
                    raise RuntimeError("compatibility memory unmeasurable")
        if not alive and exited_at is None:
            exited_at = now
            runtime_ms = (now - started) * 1000
            # setsid descendants are ultimately killed by broker container removal.
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if exited_at is not None and now - exited_at > 2:
            raise RuntimeError("output drain unconfirmed")
        for key, _ in sel.select(.001):
            if key.data == "delivery":
                try:
                    count = parent.send(payload[sent:sent + 65536])
                    sent += count
                    if sent == len(payload):
                        sel.unregister(parent)
                        parent.close()
                        payload = b""
                except (BrokenPipeError, ConnectionResetError):
                    sel.unregister(parent)
                    parent.close()
                continue
            data = os.read(key.fd, 65536)
            if not data:
                sel.unregister(key.fileobj)
                key.fileobj.close()
                continue
            cap = caps[key.data]
            capture = captures[key.data]
            available = cap - len(capture)
            capture.extend(data[:available])
            if key.data == "stdout" and len(data) > available:
                truncated = True
    code = child.wait()
    if code == 70 and engine == "pyodide":
        raise RuntimeError("learner boot/protocol failed")
    outcome = "MEMORY_LIMIT" if memory_limit else "TIME_LIMIT" if timed_out else "PASSED" if code == 0 else "RUNTIME_ERROR"
    stdout, decoding_truncated = decoded_capture(captures["stdout"], limit)
    send({"type": "RESULT", "result": {"stdout": stdout,
          "stderr": "" if memory_limit or timed_out else bounded_text(captures["stderr"], caps["stderr"]),
          "outcome": outcome, "runtimeMs": runtime_ms, "outputTruncated": truncated or decoding_truncated}})
    # Remain alive so the broker can inspect cgroup OOM counters before removal.
    sys.stdin.buffer.read(1)


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        # No source/stdin/output appears in infrastructure diagnostics.
        sys.stderr.write("guest supervisor failed\n")
        sys.exit(70)
