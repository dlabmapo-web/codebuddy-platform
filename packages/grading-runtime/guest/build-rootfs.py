"""Build a Python-only tree; include ELF dependencies, stdlib and fixed bootstrap."""
import json
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
