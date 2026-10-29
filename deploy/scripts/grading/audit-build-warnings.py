#!/usr/bin/env python3
"""Audit known pnpm deploy dev-bin warnings without suppressing build output."""
import argparse
from pathlib import Path
import re

EXPECTED={
    'api':{'acorn','browserslist','esbuild','terser','vite','webpack'},
    'worker':{'prisma'},
    'broker':set(),
    'migration':set(),
}

def audit(text,kind):
    found=[]
    for line in text.splitlines():
        if 'Failed to create bin' not in line:continue
        match=re.search(r'node_modules/\.bin/([\w-]+)\.',line)
        if not match or match[1] not in EXPECTED[kind] or 'ENOENT' not in line:
            raise ValueError('Unreviewed missing executable warning')
        found.append(match[1])
    return sorted(set(found))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind',choices=EXPECTED);parser.add_argument('log',type=Path)
    args=parser.parse_args()
    try:print('Reviewed dev-only missing-bin names: '+','.join(audit(args.log.read_text(),args.kind)))
    except ValueError as error:raise SystemExit(str(error))
