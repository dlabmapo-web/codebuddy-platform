import json
import pathlib
import sys
import runpy
import builtins
import traceback
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
# The material's fixed virtual desktop is the course drawing viewport. Fill it
# initially instead of showing a small default Tk window on a black desktop.
# Explicit learner Screen.setup()/screensize() calls still take precedence;
# browser fitting/expansion never changes this geometry or pen/shape defaults.
if manifest.get('courseViewport'):
    import turtle as course_turtle
    course_turtle._CFG['width'] = 1.0
    course_turtle._CFG['height'] = 1.0
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
exit_code = 0
try:
    runpy.run_path(str(root / manifest['entryPoint']), run_name='__main__')
except SystemExit as error:
    exit_code = error.code if isinstance(error.code, int) else (1 if error.code else 0)
    if error.code and not isinstance(error.code, int):
        print(error.code, file=sys.stderr)
except BaseException:
    exit_code = 1
    traceback.print_exc()

# Course completion is separate from window lifetime. Do not create a window
# for text-only programs, recreate a destroyed window, or change Turtle defaults.
# The broker owns the bounded retention deadline and kills the whole sandbox.
tk = sys.modules.get('tkinter')
window = getattr(tk, '_default_root', None) if tk else None
if manifest.get('retainDrawing') and window is not None:
    try:
        if window.winfo_exists():
            # Completed source must not keep executing scheduled user callbacks.
            for callback in window.tk.splitlist(window.tk.call('after', 'info')):
                window.after_cancel(callback)
            turtle_module = sys.modules.get('turtle')
            screen = getattr(getattr(turtle_module, 'Turtle', None), '_screen', None)
            if screen is not None:
                screen.update()  # Also flush Turtle's tracer(0) drawing queue.
            window.update_idletasks()
            window.update()
            sys.stdout.flush()
            sys.stderr.write(f'\x1eCOVE_EXIT:{exit_code & 255}\x1f')
            sys.stderr.flush()
            window.mainloop()
    except tk.TclError:
        pass  # Explicit bye()/destroy() has already closed the graphical window.
sys.exit(exit_code)
