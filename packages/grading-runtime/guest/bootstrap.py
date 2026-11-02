"""Immutable entrypoint. FD 3 is closed BEFORE any learner compilation/execution."""
import builtins
import io
import json
import os
import sys
import types

payload = json.load(sys.stdin)
source = payload["code"]
stdin = payload["stdin"]
ignore_prompt = payload.get("inputPromptPolicy", "INCLUDE") == "IGNORE"
sys.stdin = io.TextIOWrapper(io.BytesIO(stdin.encode("utf-8")), encoding="utf-8")
sys.argv = ["main.py"]
if ignore_prompt:
    original_input = builtins.input
    def quiet_input(prompt="", /):
        return original_input()
    builtins.input = quiet_input
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
    learner_module = types.ModuleType("__main__")
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

os.write(3, b"R")
if os.read(3, 1) != b"G":
    os._exit(125)
os.close(3)
# No launcher/trusted result descriptor survives this point.
run_script(source)
