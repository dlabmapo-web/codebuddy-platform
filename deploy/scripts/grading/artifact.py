#!/usr/bin/env python3
"""Content identity for the extracted, immutable host broker artifact."""
import argparse
import hashlib
import os
from pathlib import Path
from release import digest, require

def tree_identity(directory):
    root=Path(directory).resolve(strict=True);entries=[]
    for path in sorted(root.rglob('*')):
        relative=str(path.relative_to(root))
        if path.is_symlink():
            require(path.resolve(strict=True).is_relative_to(root),'Artifact symlink escapes release')
            entries.append([relative,'symlink',os.readlink(path)])
        elif path.is_file():entries.append([relative,'file',hashlib.sha256(path.read_bytes()).hexdigest()])
        elif not path.is_dir():raise ValueError('Unsupported artifact entry')
    require(entries,'Empty broker artifact')
    return digest(entries)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('directory');a=p.parse_args();print(tree_identity(a.directory))
