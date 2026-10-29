"""One source delivery, with no trusted descriptors left in student execution."""
import builtins
import io
import json
import os
import re
import socket
import sys


def main():
    control = socket.socket(fileno=3)
    control.sendall(b"READY\n")
    stream = control.makefile("rb")
    line = stream.readline(64 * 1024 * 1024 + 1)
    if not line.endswith(b"\n") or len(line) > 64 * 1024 * 1024:
        os._exit(70)
    job = json.loads(line)
    stream.close()
    control.close()
    # Match JavaScript Buffer.from for lone UTF-16 surrogates accepted by JSON.
    stdin_text = re.sub(r"[\ud800-\udfff]", "\ufffd", job["stdin"])
    stdin = io.TextIOWrapper(io.BytesIO(stdin_text.encode("utf-8")), encoding="utf-8")
    sys.stdin = stdin
    original_input = builtins.input
    if job["inputPromptPolicy"] == "IGNORE":
        def quiet_input(prompt="", /):
            return original_input()
        builtins.input = quiet_input
    namespace = {"__name__": "__main__", "__file__": "main.py"}
    source = re.sub(r"[\ud800-\udfff]", "\ufffd", job["code"])
    code = compile(source, "main.py", "exec", dont_inherit=True)
    execute, exit_type = builtins.exec, builtins.SystemExit
    try:
        execute(code, namespace, namespace)
    except exit_type as error:
        if error.code is None or isinstance(error.code, int) and error.code == 0:
            return
        raise


if __name__ == "__main__":
    main()
