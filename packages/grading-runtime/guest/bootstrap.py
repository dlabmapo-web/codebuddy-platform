"""Immutable entrypoint. FD 3 is closed BEFORE any learner compilation/execution."""
import builtins
import io
import os
import resource
import sys

def run_script(source):
    # Function locals retain the original primitives even if learner code mutates
    # builtins or imports the learner's __main__ module.
    compile_script = builtins.compile
    execute = builtins.exec
    exit_type = builtins.SystemExit
    exit_code = exit_type.code.__get__
    is_instance = builtins.isinstance
    integer = builtins.int
    integer_equal = integer.__eq__
    learner_module = type(sys)("__main__")
    learner_module.__file__ = "main.py"
    sys.modules["__main__"] = learner_module
    namespace = learner_module.__dict__
    program = compile_script(source, "main.py", "exec", flags=0, dont_inherit=True)
    try:
        execute(program, namespace, namespace)
    except exit_type as error:
        code = exit_code(error)
        if code is None or (is_instance(code, integer) and integer_equal(code, 0)):
            return
        # CPython's OS status wraps 256/-256 to zero. Preserve the grading
        # wrapper's nonzero-integer failure semantics without a result FD.
        if is_instance(code, integer):
            raise exit_type(1) from None
        raise

# Ready is signalled before the request exists, so the launcher can start and
# verify jails ahead of demand. The request arrives on stdin only when claimed.
os.write(3, b"R")
# A fixed header line and raw bytes, not JSON: importing json (and the re/enum
# machinery behind it) cost every case about 7 ms before its source ran.
# "cove-request-1 <code bytes> <stdin bytes> <INCLUDE|IGNORE> <time limit ms>"
header, _, body = sys.stdin.buffer.read().partition(b"\n")
fields = header.split(b" ")
if (len(fields) != 5 or fields[0] != b"cove-request-1" or
        fields[3] not in (b"INCLUDE", b"IGNORE") or
        int(fields[1]) + int(fields[2]) != len(body)):
    os._exit(125)
source = body[:int(fields[1])].decode("utf-8")
stdin = body[int(fields[1]):]
ignore_prompt = fields[3] == b"IGNORE"
# Every jail starts with its class's CPU backstop. Lower both limits to this
# case's (an unprivileged process cannot raise them again) and acknowledge;
# the launcher reads the result back from /proc before it sends GO.
cpu_seconds = -(-int(fields[4]) // 1000) + 1
resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
os.write(3, b"A")
sys.stdin = io.TextIOWrapper(io.BytesIO(stdin), encoding="utf-8")
sys.argv = ["main.py"]
if ignore_prompt:
    original_input = builtins.input
    def quiet_input(prompt="", /):
        return original_input()
    builtins.input = quiet_input
if os.read(3, 1) != b"G":
    os._exit(125)
os.close(3)
# No launcher/trusted result descriptor survives this point.
run_script(source)
