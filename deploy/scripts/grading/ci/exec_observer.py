"""Read-only, bounded Linux exec/OOM trace. No argv, environment or source capture.

bpftrace cgroup is bpf_get_current_cgroup_id(); Linux documents comparison to
name_to_handle_at's cgroup file handle (not stat inode or asynchronous path text).
https://bpftrace.org/docs/0.22
https://man7.org/linux/man-pages/man7/bpf-helpers.7.html
https://man7.org/linux/man-pages/man2/name_to_handle_at.2.html
"""
import ctypes
import os
from pathlib import Path
import queue
import re
import socket
import struct
import subprocess
import threading
import time

MAX_EVENTS = 512
MAX_BYTES = 256 * 1024


def cgroup_id(path):
    path = Path(path)
    if not path.is_relative_to('/sys/fs/cgroup') or path.resolve() != path:
        raise ValueError('Untrusted cgroup path')
    class Handle(ctypes.Structure):
        _fields_ = [('size', ctypes.c_uint), ('kind', ctypes.c_int), ('data', ctypes.c_ubyte * 128)]
    handle = Handle(); handle.size = 128
    mount = ctypes.c_int()
    libc = ctypes.CDLL(None, use_errno=True)
    function = libc.name_to_handle_at
    function.argtypes = [ctypes.c_int, ctypes.c_char_p, ctypes.c_void_p, ctypes.c_void_p, ctypes.c_int]
    function.restype = ctypes.c_int
    if function(-100, os.fsencode(path), ctypes.byref(handle), ctypes.byref(mount), 0) != 0:
        raise OSError(ctypes.get_errno(), 'Cgroup file handle unavailable')
    if handle.size != 8 or handle.kind != 0xfe:
        raise ValueError('Unsupported cgroup file handle')
    return int.from_bytes(bytes(handle.data[:8]), byteorder='little')


def program(uid):
    if not isinstance(uid, int) or uid <= 0:
        raise ValueError('Nonroot mapped learner UID required')
    # Enter captures the gate identity before interpreter exec. sched_process_exec
    # proves success (execve entry alone could be a failed attempt). Maps only hold
    # the fixed learner UID and are deleted on success/failure/process exit.
    return r'''
tracepoint:syscalls:sys_enter_execve
/uid == LEARNER_UID && comm == "gated-launcher"/
{
  @gate[pid] = cgroup;
  printf("GATE %d %d %llu %s\n", pid, uid, cgroup, str(args.filename));
}
tracepoint:sched:sched_process_exec
/@gate[pid]/
{
  printf("EXEC %d %d %llu %s\n", pid, uid, cgroup, str(args.filename));
  delete(@gate[pid]);
}
tracepoint:syscalls:sys_exit_execve
/@gate[pid] && args.ret < 0/
{ printf("FAILED %d\n", pid); delete(@gate[pid]); }
tracepoint:sched:sched_process_exit
/@gate[pid]/
{ delete(@gate[pid]); }
tracepoint:oom:mark_victim
{ printf("OOM %d\n", args.pid); }
END { clear(@gate); }
'''.replace('LEARNER_UID', str(uid))


def attached_notification(data, credentials, pid):
    # BEGIN executes before attach. bpftrace's native systemd READY notification
    # is emitted after attach; authenticate the real sender, not a JSON claim.
    if credentials != (pid, 0, 0): raise ValueError('Observer notification sender changed')
    return b'READY=1' in data.splitlines()


class Observer:
    def __init__(self, uid):
        self.events = []; self.gates = {}; self.execs = {}; self.victims = []; self.watched_victims = set()
        self.lines = queue.Queue(maxsize=MAX_EVENTS)
        self.bytes = 0; self.error = None
        notify_path = '/var/lib/cove-grading-ci/observer-notify.sock'
        if os.path.lexists(notify_path): raise ValueError('Observer notification path occupied')
        notification = socket.socket(socket.AF_UNIX, socket.SOCK_DGRAM)
        notification.setsockopt(socket.SOL_SOCKET, socket.SO_PASSCRED, 1)
        notification.bind(notify_path); os.chmod(notify_path, 0o600)
        notification.settimeout(.1)
        try:
            self.process = subprocess.Popen(['/usr/bin/bpftrace', '-q', '-B', 'line', '-e', program(uid)],
                                            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                            env={'PATH': '/usr/sbin:/usr/bin:/sbin:/bin', 'LANG': 'C.UTF-8',
                                                 'BPFTRACE_MAX_STRLEN': '128', 'BPFTRACE_MAP_KEYS_MAX': '512',
                                                 'BPFTRACE_PERF_RB_PAGES': '16', 'NOTIFY_SOCKET': notify_path})
        except BaseException:
            notification.close(); os.unlink(notify_path)
            raise

        def pump(stream, diagnostic):
            try:
                while True:
                    line = stream.readline(1025)
                    if not line: break
                    self.bytes += len(line)
                    if len(line) > 1024 or self.bytes > MAX_BYTES:
                        raise ValueError('Observer output exceeded bound')
                    if diagnostic:
                        # Lost events, probe/compiler errors and warnings invalidate proof.
                        if line.strip(): self.error = 'Observer diagnostic; tracing proof unavailable'
                    else: self.lines.put_nowait(line.decode('utf-8').strip())
            except Exception:
                self.error = 'Observer stream failed or exceeded bound'
        self.threads = [threading.Thread(target=pump, args=(stream, diag), daemon=True)
                        for stream, diag in [(self.process.stdout, False), (self.process.stderr, True)]]
        for thread in self.threads: thread.start()
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                self.check()
                try:
                    data, ancillary, flags, _ = notification.recvmsg(1024, socket.CMSG_SPACE(struct.calcsize('3i')))
                except socket.timeout: continue
                credentials = [struct.unpack('3i', value) for level, kind, value in ancillary
                               if level == socket.SOL_SOCKET and kind == socket.SCM_CREDENTIALS]
                if flags or len(credentials) != 1: raise ValueError('Invalid observer notification credentials')
                if attached_notification(data, credentials[0], self.process.pid): return
            raise ValueError('Kernel observer did not confirm attached probes')
        except BaseException:
            try: self.close()
            except Exception: pass
            raise
        finally:
            notification.close(); os.unlink(notify_path)

    def watch_victim(self, pid):
        if type(pid) is not int or pid <= 0: raise ValueError('Invalid watched victim')
        self.watched_victims.add(pid)

    def check(self):
        if self.error: raise ValueError(self.error)
        if self.process.poll() is not None: raise ValueError('Kernel observer exited')

    def drain(self):
        self.check()
        while True:
            try: line = self.lines.get_nowait()
            except queue.Empty: break
            if len(self.events) >= MAX_EVENTS: raise ValueError('Kernel event bound exceeded')
            match = re.fullmatch(r'(GATE|EXEC) ([0-9]+) ([0-9]+) ([0-9]+) (/usr/local/bin/(?:python3|node))', line)
            if match:
                kind, pid, uid, group, executable = match.groups()
                event = dict(kind=kind, pid=int(pid), uid=int(uid), cgroupId=int(group), executable=executable)
                target = self.gates if kind == 'GATE' else self.execs
                if event['pid'] in target: raise ValueError('Duplicate interpreter exec identity')
                target[event['pid']] = event
            elif re.fullmatch(r'OOM [0-9]+', line):
                event = dict(kind='OOM', pid=int(line.split()[1]))
                if event['pid'] not in self.watched_victims: continue
                self.victims.append(event['pid'])
            else: raise ValueError('Unexpected or failed kernel event')
            self.events.append(event)
        return self.events

    def close(self):
        if self.process.poll() is None: self.process.terminate()
        try: self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill(); self.process.wait(timeout=5)
        for thread in self.threads: thread.join(timeout=1)
        if self.error: raise ValueError(self.error)
