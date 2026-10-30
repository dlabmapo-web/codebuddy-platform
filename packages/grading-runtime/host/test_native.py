#!/usr/bin/env python3
"""Native parser/policy and real Unix peer contracts; not guest containment evidence."""
import errno
import hashlib
import json
import os
import shutil
import socket
import struct
import time
import multiprocessing
import stat
import tempfile
import subprocess
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent

class NativeContracts(unittest.TestCase):
    def fixture(self, *args, data=b''):
        return subprocess.run([str(HERE / 'bin/fixtures'), *args], input=data, capture_output=True, timeout=4)

    def test_sha256_known_and_streaming_vectors(self):
        for data in (b'', b'abc', b'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', bytes(range(256))*8193):
            with self.subTest(length=len(data)):
                result = self.fixture('sha256', data=data)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout.strip().decode(), hashlib.sha256(data).hexdigest())

    def test_strict_json_grammar(self):
        for value in (b'{"a":1,"a":2}', b'{"a":1,}', b'{"a":NaN}', b'{"a":1e2}', b'{"a":01}', b'{"a":"x\\ny"}', b'{"a":1}{}', b'['*10+b']'*10, b' '*8193):
            with self.subTest(value=value[:50]):
                self.assertNotEqual(self.fixture('json', data=value).returncode, 0)
        self.assertEqual(self.fixture('json', data=b'{"a":1}').returncode, 0)

    def test_config_parser_exact_schema_and_bounds(self):
        config = dict(version=1, uid=23001, gid=23001, hostUserNamespaceDevice=4,
            hostUserNamespaceInode=4026531837, daemonSocket='/run/user/23001/cove-grading/docker.sock',
            daemonExecutable='/opt/cove/grading/fixture/host/bin/synthetic-daemon',
            daemonExecutableSha256='0'*64, daemonConfig='/home/grading/.config/cove-grading/daemon.json',
            cgroupParent='/sys/fs/cgroup', attestorSocket='/run/user/23001/cove-grading/attestor.sock',
            attestorExecutable='/opt/cove/grading/fixture/host/bin/attestor', attestorExecutableSha256='1'*64,
            clientExecutable='/opt/cove/grading/fixture/host/bin/attestor-client', clientExecutableSha256='2'*64,
            attestorUnitSha256='3'*64, artifactTreeIdentity='4'*64)
        good = json.dumps(config).encode()
        self.assertEqual(self.fixture('config', data=good).returncode, 0)
        cases = [{**config, 'unknown': 1}, {**config, 'uid': 0}, {**config, 'uid': 2**32},
                 {**config, 'gid': 9007199254740992}, {**config, 'daemonExecutableSha256': 'G'*64},
                 {**config, 'daemonConfig': '/home/grading/../bad'},
                 {**config, 'daemonExecutable': '/opt/' + 'a'*512},
                 {**config, 'attestorSocket': '/tmp/attestor.sock'}]
        for value in cases:
            with self.subTest(value=str(value)[:80]):
                self.assertNotEqual(self.fixture('config', data=json.dumps(value).encode()).returncode, 0)
        self.assertNotEqual(self.fixture('config', data=good[:-1]+b',"version":1}').returncode, 0)
        for key in config:
            missing=dict(config); del missing[key]
            self.assertNotEqual(self.fixture('config', data=json.dumps(missing).encode()).returncode, 0)

    def test_proof_parser_exact_schema_and_bounds(self):
        proof = dict(version=1, bootId='12345678-1234-1234-1234-123456789abc', instance='1'*64,
            configSha256='2'*64, helperPid=123, helperUid=23001, helperGid=23001,
            helperStartTime='12345', helperUserNamespaceDevice=4, helperUserNamespaceInode=4026531837,
            helperCgroup='/sys/fs/cgroup/user.slice/cove-grading.slice/helper',
            helperExecutable='/opt/cove/grading/fixture/host/bin/attestor', helperExecutableDevice=10,
            helperExecutableInode=11, helperExecutableSha256='3'*64,
            socketPath='/run/user/23001/cove-grading/attestor.sock', socketDevice=12, socketInode=13,
            socketUid=23001, socketGid=23001, socketMode=384, noNewPrivs=1, seccomp=2, dumpable=0,
            dumpabilityEvidence='native-prctl-and-proc-owner',
            clientExecutable='/opt/cove/grading/fixture/host/bin/attestor-client', clientExecutableDevice=14,
            clientExecutableInode=15, clientExecutableSha256='4'*64, attestorUnitSha256='5'*64,
            artifactTreeIdentity='6'*64)
        good=json.dumps(proof).encode()
        self.assertEqual(self.fixture('proof',data=good).returncode,0)
        for key in proof:
            missing=dict(proof); del missing[key]
            self.assertNotEqual(self.fixture('proof',data=json.dumps(missing).encode()).returncode,0)
        for key, value in [('unknown',1),('helperPid',2**31),('helperUid',0),('socketMode',438),('socketMode',448),
                           ('dumpable',2),('seccomp',0),('noNewPrivs',0),('instance','Z'*64),
                           ('helperStartTime','001'),('bootId','garbage')]:
            changed={**proof,key:value}
            self.assertNotEqual(self.fixture('proof',data=json.dumps(changed).encode()).returncode,0)
        self.assertNotEqual(self.fixture('proof',data=good[:-1]+b',"version":1}').returncode,0)

    def test_static_artifact_manifest(self):
        manifest=json.loads((HERE/'bin/manifest.json').read_text())
        self.assertEqual(manifest['compiler']['gcc']['version'], 'gcc (GCC) 14.3.0')
        for name, binary in manifest['binaries'].items():
            self.assertEqual(hashlib.sha256((HERE/'bin'/name).read_bytes()).hexdigest(),binary['sha256'])
            self.assertFalse(binary['elf']['hasInterpreter'])
            self.assertFalse(binary['elf']['executableStack'])
            self.assertEqual(binary['elf']['neededLibraries'],[])

    def test_attestor_bind_exact_private_mode_and_no_adoption(self):
        # Exercise the production startup bind, without simulating seccomp readiness.
        with tempfile.TemporaryDirectory(prefix='cove-bind-') as folder:
            path = Path(folder) / 'attestor.sock'
            result = self.fixture('bind-attestor', str(path))
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout, b'384 1 1\n')  # 0600, nonblocking, CLOEXEC.
            self.assertFalse(path.exists())
            path.write_bytes(b'EXISTING_PATH_MUST_REMAIN')
            before = path.stat()
            self.assertNotEqual(self.fixture('bind-attestor', str(path)).returncode, 0)
            self.assertEqual(path.read_bytes(), b'EXISTING_PATH_MUST_REMAIN')
            self.assertEqual(path.stat().st_ino, before.st_ino)

    def test_seccomp_real_denials(self):
        self.assertEqual(self.fixture('exec-unfiltered').returncode, 0)
        self.assertEqual(self.fixture('fd-export-unfiltered').returncode, 0)
        for operation in ('exec', 'execat', 'fork', 'clone', 'clone3', 'vfork', 'setns', 'unshare', 'ptrace', 'process-write', 'mmap-exec', 'mprotect-exec', 'dumpable', 'sendmsg', 'sendmmsg'):
            with self.subTest(operation=operation):
                result = self.fixture('policy', operation)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(int(result.stdout), errno.EPERM)


UID = GID = 23001
PROFILE = Path('/opt/cove/grading/fixture')
CONFIG = Path('/etc/cove-grading/attestor/config.json')
PROOF = CONFIG.with_name('proof.json')
RUNTIME = Path(f'/run/user/{UID}/cove-grading')


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def start_time(pid):
    return Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()[19]


def forged_server(path, mode, ready):
    """Only test harness can forge root proof; production has no simulation mode."""
    os.setgroups([])
    os.setgid(GID)
    os.setuid(UID)
    os.umask(0o177)
    listener = socket.socket(socket.AF_UNIX)
    listener.bind(str(path))
    listener.listen(1)
    ready.send(os.getpid())
    connection, _ = listener.accept()
    with connection:
        request = b''
        while len(request) < 48:
            chunk = connection.recv(48 - len(request))
            if not chunk:
                return
            request += chunk
        nonce = request[8:40]
        if mode == 'timeout':
            time.sleep(2)
            return
        if mode == 'oversized':
            connection.sendall(b'COVEAR01' + nonce + struct.pack('!II', 0, 8192))
            return
        payload = mode['payload'] if isinstance(mode, dict) else b'{}'
        if isinstance(mode, dict) and mode.get('nonce'):
            nonce = b'X' * 32
        response = b'COVEAR01' + nonce + struct.pack('!II', 0, len(payload)) + payload
        connection.sendall(response)
        if isinstance(mode, dict) and mode.get('trailing'):
            connection.sendall(b'x')


class LiveContracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if HERE != Path('/fixture/host') or os.geteuid() != 0:
            raise RuntimeError('Live fixtures require the isolated Dockerfile.test root setup')
        (PROFILE / 'host/bin').mkdir(parents=True, exist_ok=True)
        CONFIG.parent.mkdir(parents=True, exist_ok=True)
        RUNTIME.mkdir(parents=True, exist_ok=True)
        os.chown(RUNTIME, UID, GID)
        os.chmod(RUNTIME, 0o700)
        for source, name in [('attestor', 'attestor'), ('attestor-client', 'attestor-client'), ('fixtures', 'synthetic-daemon')]:
            target = PROFILE / 'host/bin' / name
            shutil.copyfile(HERE / 'bin' / source, target)
            target.chmod(0o555)
        cls.client = PROFILE / 'host/bin/attestor-client'
        cls.helper = PROFILE / 'host/bin/attestor'
        cls.daemon_exe = PROFILE / 'host/bin/synthetic-daemon'
        ns = Path("/proc/1/ns/user").stat()
        cls.config = dict(version=1, uid=UID, gid=GID,
            hostUserNamespaceDevice=ns.st_dev, hostUserNamespaceInode=ns.st_ino,
            daemonSocket=str(RUNTIME / 'docker.sock'), daemonExecutable=str(cls.daemon_exe),
            daemonExecutableSha256=digest(cls.daemon_exe), daemonConfig='/home/grading/.config/cove-grading/daemon.json',
            cgroupParent='/sys/fs/cgroup', attestorSocket=str(RUNTIME / 'attestor.sock'),
            attestorExecutable=str(cls.helper), attestorExecutableSha256=digest(cls.helper),
            clientExecutable=str(cls.client), clientExecutableSha256=digest(cls.client),
            attestorUnitSha256='1' * 64, artifactTreeIdentity='2' * 64)

    def setUp(self):
        self.children = []
        self.addCleanup(self.cleanup)
        for p in (PROOF, RUNTIME / 'docker.sock', RUNTIME / 'attestor.sock'):
            p.unlink(missing_ok=True)
        CONFIG.write_text(json.dumps(self.config))
        CONFIG.chmod(0o644)
        self.daemon = self.launch_daemon()
        self.attestor = self.launch(self.helper)
        self.wait_socket(RUNTIME / 'attestor.sock', self.attestor)
        self.assertEqual(stat.S_IMODE((RUNTIME / 'attestor.sock').lstat().st_mode), 0o600)
        result = self.run_client(bootstrap=True)
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        self.proof = json.loads(result.stdout)
        PROOF.write_bytes(result.stdout)
        PROOF.chmod(0o644)

    def cleanup(self):
        for child in reversed(self.children):
            if isinstance(child, multiprocessing.Process):
                if child.is_alive():
                    child.kill()
                child.join(timeout=2)
            else:
                if child.poll() is None:
                    child.kill()
                child.wait(timeout=2)
                child.communicate()
        for path in (PROOF, CONFIG):
            if path.is_symlink():
                path.unlink()
            elif path.exists():
                path.chmod(0o644)
        CONFIG.parent.chmod(0o755)
        for path in (PROOF.with_name('linked.json'), PROOF.with_name('saved.json')):
            path.unlink(missing_ok=True)

    def launch(self, executable, *arguments):
        child = subprocess.Popen([str(executable), *arguments], user=UID, group=GID,
            extra_groups=[], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        self.children.append(child)
        return child

    def launch_daemon(self, argument=None, executable=None):
        child = self.launch(executable or self.daemon_exe, 'daemon', str(RUNTIME / 'docker.sock'),
            argument or '--config-file=' + self.config['daemonConfig'])
        self.wait_socket(RUNTIME / 'docker.sock', child)
        return child

    def wait_socket(self, path, child):
        for _ in range(100):
            if child.poll() is not None:
                self.fail(f'Fixture child exited {child.returncode}: {child.stderr.read().decode()}')
            if path.exists():
                # bind precedes seccomp/listen. Wait for kernel listener readiness.
                try:
                    with socket.socket(socket.AF_UNIX) as s:
                        s.connect(str(path))
                    return
                except ConnectionRefusedError:
                    pass
            time.sleep(0.01)
        self.fail('Fixture listener did not become ready')

    def run_client(self, bootstrap=False, env=None):
        return subprocess.run([str(self.client)] + (['--bootstrap'] if bootstrap else []),
            user=0 if bootstrap else UID, group=0 if bootstrap else GID, extra_groups=[],
            capture_output=True, timeout=3, env=env)

    def reject(self, classification=None):
        started = time.monotonic()
        result = self.run_client()
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b'')
        self.assertNotIn(b'success', result.stdout)
        self.assertRegex(result.stderr, rb'^ATTESTOR_CLIENT_[A-Z]+\n$')
        if classification is not None:
            self.assertEqual(result.stderr, (classification + '\n').encode())
        self.assertLess(time.monotonic() - started, 2)

    def store_proof(self, proof):
        PROOF.write_text(json.dumps(proof))

    def test_good_live_identity_and_ambient_environment(self):
        for env in (None, {'LD_PRELOAD': '/nonexistent.so', 'LD_LIBRARY_PATH': '/tmp',
                           'GLIBC_TUNABLES': 'glibc.malloc.check=3'}):
            result = self.run_client(env=env)
            self.assertEqual(result.returncode, 0, result.stderr)
            value = json.loads(result.stdout)
            self.assertEqual(set(value), {'version', 'proofSha256', 'daemon'})
            self.assertEqual(value['proofSha256'], digest(PROOF))
            self.assertEqual(value['daemon']['pid'], self.daemon.pid)
            self.assertEqual(value['daemon']['startTime'], start_time(self.daemon.pid))
            self.assertEqual(value['daemon']['executableSha256'], digest(self.daemon_exe))
            self.assertEqual(len(self.proof), 31)
            self.assertEqual(self.proof['dumpabilityEvidence'], 'native-prctl-and-proc-owner')

    def test_nonroot_bootstrap_rejected(self):
        result = subprocess.run([str(self.client), '--bootstrap'], user=UID, group=GID,
            extra_groups=[], capture_output=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, b'')

    def test_config_proof_schema_rejections(self):
        for path in (CONFIG, PROOF):
            original = path.read_bytes()
            values = (original[:-1] + b',"unknown":1}', b'{"version":1,"version":1}',
                      b'{', b' '*8193, original.replace(b'"version": 1', b'"version": 1e0'),
                      original.replace(b'"version":1', b'"version":1e0'))
            for bad in values:
                if bad == original:
                    continue
                with self.subTest(path=path.name, bad=bad[:40]):
                    path.write_bytes(bad)
                    self.reject()
                    path.write_bytes(original)

    def test_immutable_proof_and_parent(self):
        original = PROOF.read_bytes()
        for mutation in ('write', 'hardlink', 'symlink', 'owner', 'parent'):
            with self.subTest(mutation=mutation):
                if mutation == 'write': PROOF.chmod(0o666)
                elif mutation == 'hardlink': os.link(PROOF, PROOF.with_name('linked.json'))
                elif mutation == 'symlink':
                    PROOF.rename(PROOF.with_name('saved.json'))
                    PROOF.symlink_to(PROOF.with_name('saved.json'))
                elif mutation == 'owner': os.chown(PROOF, UID, GID)
                else: CONFIG.parent.chmod(0o777)
                self.reject()
                PROOF.unlink()
                for other in ('linked.json', 'saved.json'):
                    PROOF.with_name(other).unlink(missing_ok=True)
                CONFIG.parent.chmod(0o755)
                PROOF.write_bytes(original)
                PROOF.chmod(0o644)

    def test_config_link_and_writable_parent_rejected(self):
        original = CONFIG.read_bytes()
        for mutation in ('hardlink', 'symlink', 'write'):
            with self.subTest(mutation=mutation):
                sibling = CONFIG.with_name('config-saved.json')
                if mutation == 'hardlink': os.link(CONFIG, sibling)
                elif mutation == 'symlink': CONFIG.rename(sibling); CONFIG.symlink_to(sibling)
                else: CONFIG.chmod(0o666)
                try:
                    self.reject()
                finally:
                    CONFIG.unlink(); sibling.unlink(missing_ok=True)
                    CONFIG.write_bytes(original); CONFIG.chmod(0o644)

    def test_client_and_daemon_executable_inode_substitution(self):
        for executable in (self.client, self.daemon_exe):
            with self.subTest(executable=executable.name):
                saved = executable.with_suffix('.original')
                executable.rename(saved)
                shutil.copyfile(saved, executable); executable.chmod(0o555)
                try:
                    self.reject()
                finally:
                    executable.unlink(); saved.rename(executable)

    def test_changed_proof_bindings(self):
        for key in ('helperPid', 'helperUid', 'helperGid', 'helperStartTime', 'socketDevice',
                    'socketInode', 'socketMode', 'instance', 'configSha256', 'clientExecutableInode',
                    'helperExecutableSha256', 'artifactTreeIdentity', 'attestorUnitSha256', 'bootId'):
            changed = dict(self.proof)
            if isinstance(changed[key], int): changed[key] += 1
            elif key == 'helperStartTime': changed[key] = str(int(changed[key]) + 1)
            elif key == 'bootId': changed[key] = '0' * 8 + changed[key][8:]
            else: changed[key] = ('a' if changed[key][0] != 'a' else 'b') + changed[key][1:]
            with self.subTest(key=key):
                self.store_proof(changed)
                self.reject()
        self.store_proof(self.proof)

    def test_helper_restart_stale_proof(self):
        self.attestor.kill(); self.attestor.wait()
        (RUNTIME / 'attestor.sock').unlink()
        self.attestor = self.launch(self.helper)
        self.wait_socket(RUNTIME / 'attestor.sock', self.attestor)
        self.reject()

    def test_daemon_pid_change_is_observed_for_broker_freeze(self):
        self.daemon.kill(); self.daemon.wait()
        (RUNTIME / 'docker.sock').unlink()
        replacement = self.launch_daemon()
        result = self.run_client()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotEqual(json.loads(result.stdout)['daemon']['pid'], self.daemon.pid)
        self.assertEqual(json.loads(result.stdout)['daemon']['pid'], replacement.pid)

    def test_daemon_wrong_config_and_executable(self):
        self.daemon.kill(); self.daemon.wait()
        (RUNTIME / 'docker.sock').unlink()
        replacement = self.launch_daemon('--config-file=/wrong/config.json')
        self.reject()
        replacement.kill(); replacement.wait()
        (RUNTIME / 'docker.sock').unlink()
        other = PROFILE / 'host/bin/wrong-daemon'
        shutil.copyfile(self.daemon_exe, other); other.chmod(0o555)
        self.launch_daemon(executable=other)
        self.reject()

    def test_incomplete_daemon_observation(self):
        self.daemon.kill(); self.daemon.wait()
        self.reject()

    def test_malformed_requests_and_deadline(self):
        nonce = b'A' * 32
        good = b'COVEAT01' + nonce + struct.pack('!II', 1, 0)
        for request in (good + b'x', b'X' * 48, good[:40] + struct.pack('!II', 2, 0),
                        good[:44] + struct.pack('!I', 1), b'X' * 8193, good[:12]):
            with socket.socket(socket.AF_UNIX) as s:
                s.settimeout(2); s.connect(str(RUNTIME / 'attestor.sock'))
                try: s.sendall(request); s.shutdown(socket.SHUT_WR)
                except BrokenPipeError: pass
                try: response = s.recv(8192)
                except ConnectionResetError: response = b''
                if response:
                    self.assertGreaterEqual(len(response), 48)
                    self.assertNotEqual(struct.unpack('!I', response[40:44])[0], 0)
        with socket.socket(socket.AF_UNIX) as s:
            s.settimeout(2); s.connect(str(RUNTIME / 'attestor.sock'))
            started = time.monotonic(); s.sendall(good[:4])
            self.assertEqual(s.recv(1), b'')
            self.assertLess(time.monotonic() - started, 1.5)
        self.assertEqual(self.run_client().returncode, 0)

    def test_forged_same_uid_listener_and_malformed_replies(self):
        good = json.loads(self.run_client().stdout)['daemon']
        self.attestor.kill(); self.attestor.wait()
        base = dict(version=1, instance=self.proof['instance'], configSha256=digest(CONFIG),
                    bootId=self.proof['bootId'], daemon=good)
        cases = [('wrong-peer', 'PEER'), ('timeout', 'PROTOCOL'), ('oversized', 'PROTOCOL'),
                 ({'payload': b'{}'}, 'PROTOCOL'),
                 ({'payload': json.dumps(base).encode(), 'nonce': True}, 'PROTOCOL'),
                 ({'payload': json.dumps(base).encode(), 'trailing': True}, 'PROTOCOL'),
                 ({'payload': json.dumps({**base, 'instance': '0' * 64}).encode()}, 'CHANGED')]
        for mode, classification in cases:
            with self.subTest(mode=str(mode)[:60]):
                (RUNTIME / 'attestor.sock').unlink(missing_ok=True)
                receiving, sending = multiprocessing.Pipe(duplex=False)
                child = multiprocessing.Process(target=forged_server,
                    args=(RUNTIME / 'attestor.sock', mode, sending))
                child.start(); self.children.append(child)
                self.assertTrue(receiving.poll(2)); pid = receiving.recv()
                self.assertEqual(stat.S_IMODE((RUNTIME / 'attestor.sock').lstat().st_mode), 0o600)
                proof = dict(self.proof)
                if mode != 'wrong-peer':
                    # Root-forged fixture proof isolates framing checks beyond peer auth.
                    socket_stat = (RUNTIME / 'attestor.sock').stat()
                    proof.update(helperPid=pid, helperStartTime=start_time(pid),
                        socketDevice=socket_stat.st_dev, socketInode=socket_stat.st_ino)
                self.store_proof(proof)
                self.reject('ATTESTOR_CLIENT_' + classification)
                if child.is_alive(): child.kill()
                child.join(timeout=2)
                receiving.close(); sending.close()


if __name__ == '__main__':
    unittest.main(verbosity=2)
