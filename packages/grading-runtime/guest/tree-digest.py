"""Canonical tree identity shared with src/identity.ts. No timestamps/UIDs."""
import hashlib
import os
import pathlib
import stat
import sys

def file_digest(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return "sha256:" + digest.hexdigest()

def tree_digest(root):
    digest = hashlib.sha256()
    def visit(relative):
        path = pathlib.Path(root, relative)
        mode = path.lstat().st_mode
        kind = "l" if stat.S_ISLNK(mode) else "d" if stat.S_ISDIR(mode) else "f" if stat.S_ISREG(mode) else None
        if kind is None:
            raise ValueError("unsupported rootfs entry: " + relative)
        digest.update((kind + "\0" + relative + "\0" + format(stat.S_IMODE(mode), "o") + "\0").encode())
        if kind == "f":
            digest.update(file_digest(path).encode())
        elif kind == "l":
            digest.update(os.readlink(path).encode())
        digest.update(b"\0")
        if kind == "d":
            for name in sorted(os.listdir(path), key=lambda name: name.encode("utf-8")):
                visit(relative + "/" + name if relative else name)
    visit("")
    return "sha256:" + digest.hexdigest()

if __name__ == "__main__":
    print(tree_digest(sys.argv[1]))
