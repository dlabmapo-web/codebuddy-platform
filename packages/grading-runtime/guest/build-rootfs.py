"""Build a Python-only tree; include ELF dependencies, stdlib and fixed bootstrap."""
import compileall
import json
import py_compile
import os
import pathlib
import shutil
import subprocess
import sys
from tree_digest import file_digest, tree_digest

root = pathlib.Path("/opt/cove/rootfs")
root.mkdir(parents=True, exist_ok=True)
for path in ["tmp", "opt/cove", "usr/local/bin", "usr/local/lib", "etc"]:
    (root / path).mkdir(parents=True, exist_ok=True)
shutil.copy2("/usr/local/bin/python3.12", root / "usr/local/bin/python3.12")
shutil.copytree("/usr/local/lib/python3.12", root / "usr/local/lib/python3.12", ignore=shutil.ignore_patterns("site-packages", "__pycache__", "test", "tests", "ensurepip", "idlelib", "tkinter"))
shutil.copy2("/usr/local/lib/libpython3.12.so.1.0", root / "usr/local/lib/libpython3.12.so.1.0")
os.symlink("libpython3.12.so.1.0", root / "usr/local/lib/libpython3.12.so")
# The jail runs `-B` on a read-only root, so without shipped bytecode every case
# recompiles json/re/encodings from source (~4x slower interpreter startup).
# Unchecked-hash .pyc files carry no mtimes and are covered by the rootfs digest.
stdlib = root / "usr/local/lib/python3.12"
if not compileall.compile_dir(stdlib, ddir="/usr/local/lib/python3.12", quiet=1, workers=1,
                              invalidation_mode=py_compile.PycInvalidationMode.UNCHECKED_HASH):
    sys.exit("stdlib bytecode compilation failed")
if not any((stdlib / "json/__pycache__").glob("__init__.cpython-312.pyc")):
    sys.exit("stdlib bytecode missing from rootfs")
# ldd is used only on the pinned trusted interpreter and shipped stdlib extensions.
libs = set()
for binary in ["/usr/local/bin/python3.12"] + list(map(str, pathlib.Path("/usr/local/lib/python3.12/lib-dynload").glob("*.so"))):
    output = subprocess.check_output(["ldd", binary], text=True)
    for line in output.splitlines():
        for field in line.split():
            if field.startswith("/"):
                libs.add(field)
for lib in sorted(libs):
    destination = root / lib.lstrip("/")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(lib, destination)
shutil.copy2("/etc/ld.so.cache", root / "etc/ld.so.cache")
shutil.copy2("/opt/cove/bootstrap.py", root / "opt/cove/bootstrap.py")
packages = {"python": sys.version.split()[0], "thirdParty": [], "nativeLibraries": {path: file_digest(path) for path in sorted(libs)}}
(root / "opt/cove/packages.json").write_text(json.dumps(packages, sort_keys=True, separators=(",", ":")) + "\n")
pathlib.Path("/opt/cove/rootfs.digest").write_text(tree_digest(root) + "\n")
