"""One fresh non-root learner. No result/verdict channel survives into exec."""
import builtins
import json
import os
import resource
import sys

ready_fd, launch_fd = map(int, sys.argv[1:3])
status = dict(line.split(":", 1) for line in open("/proc/self/status") if ":" in line)
if os.getuid() < 20000 or os.getuid() != os.geteuid() or os.getgroups():
    raise RuntimeError("Learner identity not isolated")
if any(int(status[name].strip(), 16) for name in ["CapEff", "CapPrm", "CapAmb"]):
    raise RuntimeError("Learner retained capabilities")
if status["NoNewPrivs"].strip() != "1" or status["Seccomp"].strip() != "2":
    raise RuntimeError("Learner protections not enforced")
resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
resource.setrlimit(resource.RLIMIT_NOFILE, (32, 32))
resource.setrlimit(resource.RLIMIT_NPROC, (16, 16))
os.write(ready_fd, b"READY\n")
os.close(ready_fd)
with os.fdopen(launch_fd, "r", encoding="utf-8") as launch:
    payload = json.load(launch)
cpu_seconds = (payload["timeLimitMs"] + 999) // 1000 + 1
resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
if payload["inputPromptPolicy"] == "IGNORE":
    original_input = builtins.input

    def without_prompt(prompt="", /):
        return original_input()

    builtins.input = without_prompt

# These were used before source existed and are now closed. Neither the
# supervisor's JSON result pipe nor its stdin was inherited by this process.
sys.argv = ["solution.py"]
exec(compile(payload["code"], "solution.py", "exec"), {"__name__": "__main__", "__file__": "solution.py"})
