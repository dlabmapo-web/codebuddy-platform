"""Build the native-gcc toolchain and run roots from the pinned Debian packages.

The toolchain root holds GCC 12, binutils' assembler and linker, the C and C++
headers, the link-time libraries and the precompiled bits/stdc++.h. The run
root holds only the dynamic loader, the four libraries a program links, and the
exec gate. Both are measured like the CPython rootfs; every file comes from the
packages listed here or from the ELF closure of those files.
"""
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
from tree_digest import file_digest, tree_digest

TRIPLET = subprocess.check_output(["gcc-12", "-dumpmachine"], text=True).strip()
VERSION = subprocess.check_output(["gcc-12", "-dumpfullversion"], text=True).strip()
TOOLCHAIN = pathlib.Path("/opt/cove/gcc-root")
RUN = pathlib.Path("/opt/cove/gcc-run-root")
GATE = pathlib.Path("/opt/cove/exec-gate")

# Exactly the launcher's argv (src/policy.ts) minus input and output names. A
# precompiled header is used only when these match the C++ compile's options.
PCH_FLAGS = ["-O2", "-Wall", "-std=gnu++17", "-DONLINE_JUDGE",
             "-fdiagnostics-color=never", "-fmax-errors=20"]

# Packages whose files the compiler reads, including link-time libraries.
COMPILER_PACKAGES = [
    "gcc-12", "cpp-12", "g++-12", "libgcc-12-dev", "libstdc++-12-dev",
    "binutils", "binutils-" + TRIPLET.replace("_", "-"),
    "libc6-dev", "linux-libc-dev", "libcrypt-dev", "libnsl-dev", "libtirpc-dev",
    "rpcsvc-proto",
]
# Runtime libraries a program links against: their shared objects only.
RUNTIME_PACKAGES = ["libc6", "libstdc++6", "libgcc-s1", "libcrypt1", "libnsl2", "libtirpc3"]
# The only executables that belong in the toolchain root besides libexec's.
BINARIES = {name for base in ["gcc-12", "g++-12", "cpp-12", "as", "ld", "ld.bfd"]
            for name in (base, TRIPLET + "-" + base)}


def package_files(package):
    listing = subprocess.check_output(["dpkg-query", "-L", package], text=True)
    return [line for line in listing.splitlines() if line.startswith("/") and line != "/."]


def package_version(package):
    return subprocess.check_output(["dpkg-query", "-W", "-f", "${Version}", package], text=True)


def compiler_file(path):
    if path.startswith("/usr/share/"):
        return False
    if path.startswith(("/usr/bin/", "/bin/")):
        return os.path.basename(path) in BINARIES
    return True


def runtime_library(path):
    name = os.path.basename(path)
    return (not path.startswith("/usr/share/") and re.search(r"/lib(64)?/", path) is not None
            and ".so" in name and "gconv" not in path and "audit" not in path)


def copy(source, root):
    """Copies one path at its real location, keeping a final symlink as a symlink."""
    source = pathlib.Path(source)
    if not os.path.lexists(source):
        return
    real = pathlib.Path(os.path.realpath(source.parent)) / source.name
    destination = root / real.relative_to("/")
    if os.path.lexists(destination):
        return
    if source.is_symlink():
        destination.parent.mkdir(parents=True, exist_ok=True)
        target = os.readlink(source)
        os.symlink(target, destination)
        copy(real.parent / target if not target.startswith("/") else target, root)
    elif source.is_dir():
        destination.mkdir(parents=True, exist_ok=True)
    else:
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def elf(path):
    try:
        with open(path, "rb") as stream:
            return stream.read(4) == b"\x7fELF"
    except OSError:
        return False


def closure(root):
    """Copies the shared libraries every ELF file in the root needs."""
    libraries = set()
    for directory, _, names in os.walk(root):
        for name in names:
            path = pathlib.Path(directory, name)
            host = pathlib.Path("/") / path.relative_to(root)
            if path.is_symlink() or not elf(host):
                continue
            listing = subprocess.run(["ldd", str(host)], capture_output=True, text=True)
            if listing.returncode != 0:
                continue
            for line in listing.stdout.splitlines():
                libraries.update(field for field in line.split() if field.startswith("/"))
    for library in sorted(libraries):
        copy(library, root)


def merged_usr(root):
    for name in ["bin", "lib", "lib64", "sbin"]:
        link = pathlib.Path("/", name)
        if link.is_symlink() and not os.path.lexists(root / name):
            os.symlink(os.readlink(link), root / name)


def loader_cache(root):
    (root / "etc/ld.so.conf.d").mkdir(parents=True, exist_ok=True)
    shutil.copy2("/etc/ld.so.conf", root / "etc/ld.so.conf")
    for conf in pathlib.Path("/etc/ld.so.conf.d").glob("*.conf"):
        shutil.copy2(conf, root / "etc/ld.so.conf.d" / conf.name)
    subprocess.check_call(["ldconfig", "-r", str(root)])


def gate(root):
    (root / "opt/cove").mkdir(parents=True, exist_ok=True)
    shutil.copy2(GATE, root / "opt/cove/exec-gate")
    os.chmod(root / "opt/cove/exec-gate", 0o555)


for root in (TOOLCHAIN, RUN):
    if root.exists():
        sys.exit(f"{root} already exists")
    root.mkdir(parents=True)
    merged_usr(root)

# Toolchain root.
for package in COMPILER_PACKAGES:
    for path in package_files(package):
        if compiler_file(path):
            copy(path, TOOLCHAIN)
for package in RUNTIME_PACKAGES:
    for path in package_files(package):
        if runtime_library(path):
            copy(path, TOOLCHAIN)
closure(TOOLCHAIN)
loader_cache(TOOLCHAIN)
gate(TOOLCHAIN)
for directory in ["src", "out", "tmp"]:
    (TOOLCHAIN / directory).mkdir()
pch = TOOLCHAIN / "opt/cove/pch/bits"
pch.mkdir(parents=True)
header = pathlib.Path(f"/usr/include/{TRIPLET}/c++/12/bits/stdc++.h")
shutil.copy2(header, pch / "stdc++.h")
subprocess.check_call(["g++-12", *PCH_FLAGS, "-x", "c++-header",
                       "-o", str(pch / "stdc++.h.gch"), str(pch / "stdc++.h")])

# Run root: the loader, libc, libm, libstdc++ and libgcc_s with their closure.
for package in ["libc6", "libstdc++6", "libgcc-s1"]:
    for path in package_files(package):
        name = os.path.basename(path)
        if runtime_library(path) and name.startswith(("libc.so", "libm.so", "libstdc++.so", "libgcc_s.so", "ld-linux")):
            copy(path, RUN)
closure(RUN)
loader_cache(RUN)
gate(RUN)
(RUN / "box").mkdir()
(RUN / "box/main").touch(mode=0o444)
(RUN / "tmp").mkdir()

packages = {
    "gcc": VERSION,
    "triplet": TRIPLET,
    "packages": {name: package_version(name) for name in sorted(COMPILER_PACKAGES + RUNTIME_PACKAGES)},
    "nativeLibraries": {str(path.relative_to(RUN)): file_digest(path)
                        for path in sorted(RUN.rglob("*.so*"))
                        if path.is_file() and not path.is_symlink() and "/lib" in str(path)},
}
(TOOLCHAIN / "opt/cove/packages.json").write_text(json.dumps(packages, sort_keys=True, separators=(",", ":")) + "\n")
pathlib.Path("/opt/cove/gcc-root.digest").write_text(tree_digest(TOOLCHAIN) + "\n")
pathlib.Path("/opt/cove/gcc-run-root.digest").write_text(tree_digest(RUN) + "\n")
print(json.dumps({"gcc": VERSION, "triplet": TRIPLET}))
