import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import unittest

GUEST = Path(__file__).resolve().parent.parent / 'guest'
spec = importlib.util.spec_from_file_location('supervisor', GUEST / 'supervisor.py')
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)

class GuestTests(unittest.TestCase):
    def test_invalid_utf8_is_byte_bounded(self):
        self.assertLessEqual(len(supervisor.bounded_text(b'\xff\xff', 2).encode()), 2)
        self.assertEqual(supervisor.bounded_text('한'.encode(), 3), '한')

    def run_native(self, code, stdin='', policy='INCLUDE'):
        # Trusted unit fixtures on the host: this is not isolation evidence.
        parent, child = socket.socketpair()
        bootstrap = 'import os,runpy; os.dup2(int(os.environ["UNIT_FD"]),3); runpy.run_path(os.environ["UNIT_SHIM"],run_name="__main__")'
        process = subprocess.Popen([sys.executable, '-c', bootstrap], pass_fds=(child.fileno(),),
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env={**os.environ, 'UNIT_FD':str(child.fileno()), 'UNIT_SHIM':str(GUEST / 'native.py')})
        child.close()
        self.assertEqual(parent.recv(64), b'READY\n')
        parent.sendall((json.dumps({'code':code, 'stdin':stdin, 'inputPromptPolicy':policy})+'\n').encode())
        parent.close()
        stdout, stderr = process.communicate(timeout=10)
        return process.returncode, stdout.decode(), stderr.decode()

    def test_prompt_unicode_and_eof(self):
        self.assertEqual(self.run_native('print(input("prompt:")); print(input())', '한\nbye\n', 'IGNORE')[:2], (0,'한\nbye\n'))
        self.assertEqual(self.run_native('print(input("prompt:"))', 'x\n')[:2], (0,'prompt:x\n'))
        self.assertEqual(self.run_native('import sys; print(repr(sys.stdin.read()))')[:2], (0,"''\n"))

    def test_json_lone_surrogate_matches_utf8_replacement(self):
        self.assertEqual(self.run_native('print(input())', '\ud800\n')[:2], (0,'\ufffd\n'))

    def test_control_closed_before_source_and_exit_semantics(self):
        code='import os\ntry: os.fstat(3)\nexcept OSError: print("closed")'
        self.assertEqual(self.run_native(code)[:2],(0,'closed\n'))
        self.assertEqual(self.run_native('raise SystemExit(0)')[0],0)
        self.assertNotEqual(self.run_native('raise SystemExit(2)')[0],0)
        self.assertNotEqual(self.run_native('raise ValueError("test")')[0],0)

if __name__ == '__main__':
    unittest.main()
