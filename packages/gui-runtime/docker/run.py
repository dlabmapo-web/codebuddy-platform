import json
import pathlib
import sys
import runpy
import builtins
original_input = builtins.input
def interactive_input(*args, **kwargs):
    sys.stderr.write('\x1eCOVE_WAITING_INPUT\x1f')
    sys.stderr.flush()
    try:
        return original_input(*args, **kwargs)
    finally:
        sys.stderr.write('\x1eCOVE_RUNNING\x1f')
        sys.stderr.flush()
builtins.input = interactive_input

manifest = json.loads(sys.stdin.readline())
root = pathlib.Path('/work')
(root/'assets').symlink_to('/assets',target_is_directory=True)
for name, content in manifest['files'].items():
    parts = name.split('/')
    if not name or name == 'assets' or name.startswith('assets/') or name.startswith('/') or any(p in ('', '.', '..') for p in parts):
        raise ValueError('Invalid source path')
    path = root / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')
if manifest['entryPoint'] not in manifest['files']:
    raise ValueError('Invalid entry point')
sys.path.insert(0, str(root))
runpy.run_path(str(root / manifest['entryPoint']), run_name='__main__')
