"""Trusted single-case controller, isolated from the non-root learner's pipes.

Local feasibility fixture only. The host destroys this entire guest before
settling a case/releasing its pool allocation. No application credentials exist.
"""
import ctypes
import hashlib
import json
import os
import resource
import selectors
import signal
import subprocess
import sys
import time

MIB = 1024 * 1024
uid = int(os.environ["NATIVE_LEARNER_UID"])
if not 20000 <= uid <= 20063 or os.getuid() != 0:
    raise RuntimeError("Invalid prototype identity")
# Adopt orphaned grandchildren so that even a setsid/fork cannot survive a case.
if ctypes.CDLL(None, use_errno=True).prctl(36, 1, 0, 0, 0) != 0:
    raise RuntimeError("Cannot supervise descendants")


def events():
    return {k: int(v) for k, v in (line.split() for line in open("/sys/fs/cgroup/memory.events"))}


def resource_snapshot():
    return {
        "memoryPeakBytes": int(open("/sys/fs/cgroup/memory.peak").read()),
        "memoryMaxBytes": int(open("/sys/fs/cgroup/memory.max").read()),
        "memoryEvents": events(),
        "cpu": {k: int(v) for k, v in (line.split() for line in open("/sys/fs/cgroup/cpu.stat"))},
    }


def learners():
    found = []
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            data = dict(line.split(":", 1) for line in open(f"/proc/{name}/status") if ":" in line)
            if int(data["Uid"].split()[0]) == uid:
                found.append((int(name), int(data.get("VmRSS", "0 kB").split()[0]) * 1024))
        except (FileNotFoundError, ProcessLookupError):
            pass
    return found


def kill_learners():
    for pid, _ in learners():
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


def demote():
    os.setsid()
    os.setgroups([])
    os.setresgid(uid, uid, uid)
    os.setresuid(uid, uid, uid)


ready_r, ready_w = os.pipe()
launch_r, launch_w = os.pipe()
child = subprocess.Popen(
    [sys.executable, "-I", "-S", "-u", "/opt/native/learner.py", str(ready_w), str(launch_r)],
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    pass_fds=(ready_w, launch_r), close_fds=True, preexec_fn=demote,
    env={"PATH": "/usr/local/bin:/usr/bin:/bin", "LANG": "C.UTF-8"},
)
os.close(ready_w)
os.close(launch_r)
with os.fdopen(ready_r, "rb") as ready:
    if ready.readline(32) != b"READY\n":
        raise RuntimeError("Learner did not prove readiness")
source_files = {name: hashlib.sha256(open('/opt/native/' + name, 'rb').read()).hexdigest()
                for name in ['supervisor.py', 'learner.py']}
print(json.dumps({"type": "ready", "python": sys.version.split()[0], "uid": uid, "sourceFiles": source_files}), flush=True)

raw = sys.stdin.buffer.readline(2 * MIB)
if len(raw) >= 2 * MIB or not raw.endswith(b"\n"):
    raise RuntimeError("Oversized or incomplete fixture request")
request = json.loads(raw)
code, stdin = request["code"], request["stdin"]
budget = request["timeLimitMs"]
memory = request["memoryLimitMb"]
output_limit = request.get("outputLimitBytes", 262144)
policy = request.get("inputPromptPolicy", "INCLUDE")
if (not isinstance(code, str) or len(code.encode()) > 262144 or not isinstance(stdin, str)
        or len(stdin.encode()) > 65536 or type(budget) is not int or not 1 <= budget <= 3000
        or type(memory) is not int or not 32 <= memory <= 256 or type(output_limit) is not int or not 1 <= output_limit <= 262144
        or policy not in ["INCLUDE", "IGNORE"]):
    raise RuntimeError("Invalid fixture request")
before = events()
began = time.monotonic()

# Every input/output pipe is nonblocking: a program that never consumes stdin
# or floods output cannot prevent the trusted deadline/RSS checks from running.
sel = selectors.DefaultSelector()
launch_bytes = json.dumps({"code": code, "inputPromptPolicy": policy, "timeLimitMs": budget}).encode()
for fd, content in [(launch_w, launch_bytes), (child.stdin.fileno(), stdin.encode())]:
    os.set_blocking(fd, False)
    sel.register(fd, selectors.EVENT_WRITE, {"kind": "input", "data": content, "offset": 0})
for stream, kind in [(child.stdout, "stdout"), (child.stderr, "stderr")]:
    os.set_blocking(stream.fileno(), False)
    sel.register(stream.fileno(), selectors.EVENT_READ, {"kind": kind})
buffers = {"stdout": bytearray(), "stderr": bytearray()}
truncated, peak_rss, forced, leader_finished = False, 0, None, None
while sel.get_map() or child.poll() is None:
    current = learners()
    peak_rss = max(peak_rss, sum(rss for _, rss in current))
    elapsed = (time.monotonic() - began) * 1000
    if child.poll() is not None and leader_finished is None:
        leader_finished = time.monotonic()
    if forced is None:
        if peak_rss > memory * MIB or events()["oom_kill"] > before["oom_kill"]:
            forced = "MEMORY_LIMIT"
        elif elapsed >= budget and (leader_finished is None or (leader_finished - began) * 1000 >= budget):
            forced = "TIME_LIMIT"
        if forced:
            kill_learners()
    # Pipe-holding descendants are part of this run. Once the leader exits,
    # terminate/reap them; do not wait indefinitely for pipe EOF.
    if child.poll() is not None:
        kill_learners()
    for key, _ in sel.select(0.005):
        state = key.data
        try:
            if state["kind"] == "input":
                data = state["data"]
                if state["offset"] < len(data):
                    state["offset"] += os.write(key.fd, data[state["offset"]:])
                if state["offset"] == len(data):
                    sel.unregister(key.fd)
                    if key.fd == launch_w:
                        os.close(key.fd)
                    else:
                        child.stdin.close()
            else:
                chunk = os.read(key.fd, 16384)
                if not chunk:
                    sel.unregister(key.fd)
                    continue
                limit = output_limit if state["kind"] == "stdout" else 65536
                buf = buffers[state["kind"]]
                room = max(0, limit - len(buf))
                if len(chunk) > room and state["kind"] == "stdout":
                    truncated = True
                buf.extend(chunk[:room])
        except (BrokenPipeError, OSError) as error:
            if isinstance(error, BlockingIOError):
                continue
            if error.errno not in (9, 32):
                raise
            try:
                sel.unregister(key.fd)
            except KeyError:
                pass
    if (time.monotonic() - began) * 1000 > budget + 3000:
        raise RuntimeError("Unconfirmed learner shutdown")
runtime_ms = round(((leader_finished or time.monotonic()) - began) * 1000)
exit_code = child.wait(timeout=1)
kill_learners()
until = time.monotonic() + 1
while learners() and time.monotonic() < until:
    try:
        while os.waitpid(-1, os.WNOHANG)[0]:
            pass
    except ChildProcessError:
        pass
    kill_learners()
    time.sleep(0.005)
if learners():
    raise RuntimeError("Descendant cleanup unconfirmed")
outcome = forced or ("PASSED" if exit_code == 0 else "RUNTIME_ERROR")
print(json.dumps({"type": "result", "result": {
    "stdout": buffers["stdout"].decode("utf-8", errors="replace"),
    "stderr": "" if forced else buffers["stderr"].decode("utf-8", errors="replace"),
    "outcome": outcome, "runtimeMs": runtime_ms, "outputTruncated": truncated,
}, "resources": resource_snapshot(), "peakLearnerRssBytes": peak_rss,
    "survivingLearners": 0}), flush=True)
