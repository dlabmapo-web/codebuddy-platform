"""Kernel-shaped synthetic proc fixtures, never Linux containment certification."""
import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from daemon_identity import attest_process, attest_connected

class DaemonIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.binary=self.root/'reviewed-dockerd';self.binary.write_bytes(b'synthetic reviewed binary')
        self.proc=self.root/'proc';self.proc.mkdir();self.pid=123
        self.process=self.proc/str(self.pid);self.process.mkdir()
        (self.process/'exe').symlink_to(self.binary)
        (self.process/'cmdline').write_bytes(b'dockerd\0--config-file=/private/daemon.json\0')
        (self.process/'stat').write_text('123 (dockerd) S '+'0 '*18+'456 0\n')
        (self.process/'cgroup').write_text('0::/cove-grading.slice/daemon.service\n')
        self.config=dict(uid=os.getuid(),daemonExecutable=str(self.binary),daemonExecutableSha256=hashlib.sha256(self.binary.read_bytes()).hexdigest(),daemonConfig='/private/daemon.json',cgroupParent='/sys/fs/cgroup/cove-grading.slice')
    def tearDown(self):self.temp.cleanup()
    def snapshot(self):return attest_process(self.config,self.pid,self.proc)
    def test_kernel_executable_and_starttime_are_recorded(self):
        observed=self.snapshot();self.assertEqual(observed['pid'],123);self.assertEqual(observed['startTime'],'456');self.assertEqual(observed['executableSha256'],self.config['daemonExecutableSha256'])
    def test_spoofed_argv_does_not_prove_executable(self):
        fake=self.root/'fake';fake.write_bytes(b'not dockerd');(self.process/'exe').unlink();(self.process/'exe').symlink_to(fake)
        with self.assertRaises(ValueError):self.snapshot()
    def test_changed_reviewed_executable_is_rejected(self):
        self.binary.write_bytes(b'replaced after review')
        with self.assertRaises(ValueError):self.snapshot()
    def test_wrong_endpoint_pid_cannot_read_attested_process(self):
        with self.assertRaises(OSError):attest_process(self.config,999,self.proc)
    def test_peer_pid_uid_socket_and_restart_are_bound(self):
        snapshot=lambda config,pid:attest_process(config,pid,self.proc)
        valid=attest_connected(self.config,(123,os.getuid(),0),(1,2),(1,2),snapshot)
        self.assertEqual(valid['socketInode'],2)
        for peer,before,after in [((999,os.getuid(),0),(1,2),(1,2)),((123,99999,0),(1,2),(1,2)),((123,os.getuid(),0),(1,2),(1,3))]:
            with self.assertRaises((ValueError,OSError)):attest_connected(self.config,peer,before,after,snapshot)
        count=0
        def restarted(config,pid):
            nonlocal count
            result=snapshot(config,pid);count+=1
            if count==2:result['startTime']='reused'
            return result
        with self.assertRaisesRegex(ValueError,'restarted'):attest_connected(self.config,(123,os.getuid(),0),(1,2),(1,2),restarted)
    def test_reused_pid_changes_identity(self):
        before=self.snapshot();(self.process/'stat').write_text('123 (dockerd) S '+'0 '*18+'999 0\n')
        self.assertNotEqual(before,self.snapshot())
if __name__=='__main__':unittest.main()
