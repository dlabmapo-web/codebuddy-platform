// The same source is executed in the isolated runtime and exported in projects.
// No student code is evaluated by the application processes.
export const turtleCustomSource = String.raw`"""Cove introductory turtle commands, cove-trial-v1.

Students use from custom import * and call TForward(100), TLeft(90),
color("blue") and speed(3). The shared drawing turtle is created internally.
ReadyToRace() prepares four turtles controlled by the color-named functions.
"""
import turtle as _t
import math as _math

__all__ = ["TForward", "TLeft", "speed", "color", "ReadyToRace"]
_racers = {}
_drawing = None
_configured_screen = None

def _number(value, name):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not _math.isfinite(value):
        raise ValueError(name + ": use a finite number / 유한한 숫자를 입력해 주세요.")
    return value

def _screen():
    global _configured_screen
    screen = _t.Screen()
    screen.setup(1.0, 1.0)
    screen.title("Cove Turtle")
    if screen is not _configured_screen:
        screen.delay(30)
        _configured_screen = screen
    return screen

def _pen():
    global _drawing
    _screen()
    pen = _t.getturtle()
    if pen is not _drawing:
        pen.shape("turtle")
        pen.shapesize(2, 2, 2)
        pen.pensize(5)
        pen.speed(1)
        _drawing = pen
    return pen

def TForward(distance):
    """Move the shared drawing turtle forward; negative distances move back."""
    _pen().forward(_number(distance, "TForward"))

def TLeft(angle):
    """Turn left by degrees, including fractional and negative angles."""
    _pen().left(_number(angle, "TLeft"))

def speed(value=None):
    if value is None:
        return _pen().speed()
    value = _number(value, "speed")
    if not isinstance(value, int) or not 0 <= value <= 10:
        raise ValueError("speed: use an integer from 0 to 10 / 0~10 정수를 입력해 주세요.")
    return _pen().speed(value)

def color(*value):
    return _pen().color(*value)

def ReadyToRace():
    global _racers
    screen = _screen()
    screen.clearscreen()
    screen.update()
    # Equal x/y units; the browser scales this fixed coordinate system.
    # CPython setworldcoordinates uses the window dimensions minus 20 pixels.
    width = max(screen.window_width() - 20, 1)
    height = max(screen.window_height() - 20, 1)
    vertical = 500 * height / width
    screen.setworldcoordinates(-500, -vertical, 500, vertical)
    screen.bgcolor("#e8f2f5")
    screen.tracer(0)
    track = _t.Turtle(visible=False)
    track.speed(0)
    track.penup()
    track.goto(-440, -230)
    track.color("#c7dce5", "#ffffff")
    track.begin_fill()
    for x, y in [(400, -230), (400, 230), (-440, 230), (-440, -230)]:
        track.goto(x, y)
    track.end_fill()
    for y in [-240, -120, 0, 120, 240]:
        track.penup(); track.goto(-440, y); track.pendown(); track.goto(400, y)
    track.penup(); track.goto(330, -230); track.pendown()
    track.color("#244a60"); track.width(4); track.goto(330, 230)
    track.penup(); track.goto(330, 240)
    track.write("FINISH  x > 330", align="center", font=("DejaVu Sans", 12, "bold"))
    _racers = {}
    for name, shade, y in [("Blue", "#087fcc", 180), ("Pink", "#d72c83", 60), ("Yellow", "#b18000", -60), ("Green", "#16824e", -180)]:
        racer = _t.Turtle(shape="turtle")
        racer.shapesize(2, 2, 2)
        racer.color(shade); racer.speed(0); racer.penup(); racer.goto(-400, y)
        racer.write(name, align="center", font=("DejaVu Sans", 11, "normal"))
        racer.pendown(); racer.width(5); racer.speed(1)
        _racers[name] = racer
    screen.tracer(1, 30)
    screen.update()

def _racer(name):
    if name not in _racers:
        raise RuntimeError("Call ReadyToRace() first / 먼저 ReadyToRace()를 실행해 주세요.")
    return _racers[name]

def _forward(name, value):
    _racer(name).forward(_number(value, name + "Forward"))

def _left(name, value):
    _racer(name).left(_number(value, name + "Left"))

def _commands(name):
    def forward(distance): return _forward(name, distance)
    def left(angle): return _left(name, angle)
    def x(): return _racer(name).xcor()
    return forward, left, x

for _name in ("Blue", "Pink", "Yellow", "Green"):
    for _suffix, _function in zip(("Forward", "Left", "X"), _commands(_name)):
        globals()[_name + _suffix] = _function
        __all__.append(_name + _suffix)
`;

export const turtleShapeSource = String.raw`"""Small optional Cove welcome drawing, cove-trial-v1."""
import turtle as _t
__all__ = ["CircleTurtle"]
_demo = None
def CircleTurtle():
    global _demo
    screen = _t.Screen()
    screen.setup(1.0, 1.0)
    if _demo is None or _demo not in screen.turtles():
        _demo = _t.Turtle(shape="turtle")
        _demo.shapesize(2, 2, 2)
    _demo.clear(); _demo.penup(); _demo.home(); _demo.speed(1)
    _demo.pendown(); _demo.color("#2787d5"); _demo.width(5)
    _demo.circle(65)
`;

export const turtleRunnerSource = String.raw`import runpy
import sys
import turtle
# Keep Python pen values intact while making strokes legible in the scaled
# classroom canvas, including programs that explicitly request a thin pen.
_original_drawline = turtle.TurtleScreenBase._drawline
def _classroom_drawline(self, lineitem, coordlist=None, fill=None, width=None, top=False):
    if isinstance(width, (int, float)) and width >= 0:
        width = max(6, width * 2)
    return _original_drawline(self, lineitem, coordlist, fill, width, top)
turtle.TurtleScreenBase._drawline = _classroom_drawline
# Classroom defaults apply to every standard turtle in this guest process.
# Keep the class identity and honor later explicit pensize()/shapesize() calls.
_original_init = turtle.RawTurtle.__init__
_original_reset = turtle.RawTurtle.reset
def _drawing_defaults(pen):
    pen.pensize(5)
    pen.shapesize(2, 2, 2)
def _classroom_init(self, *args, **kwargs):
    _original_init(self, *args, **kwargs)
    _drawing_defaults(self)
def _classroom_reset(self):
    _original_reset(self)
    _drawing_defaults(self)
turtle.RawTurtle.__init__ = _classroom_init
turtle.RawTurtle.reset = _classroom_reset
# The guest page presents a drawing surface, without desktop window borders.
screen = turtle.Screen()
screen.setup(1.0, 1.0)
screen.delay(30)
canvas = screen.getcanvas()
canvas.winfo_toplevel().overrideredirect(True)
canvas._canvas.configure(borderwidth=0, highlightthickness=0, relief="flat")
canvas._canvas.grid_configure(padx=0, pady=0)
runpy.run_path("/work/main.py", run_name="__main__")
if turtle.TurtleScreen._RUNNING and turtle._Screen._root is not None:
    turtle.update()
    sys.stderr.write("\x1eCOVE_DISPLAYING\x1f")
    sys.stderr.flush()
    turtle.mainloop()
`;

export const turtleProjectReadme = `Cove Turtle — cove-trial-v1

Start with the lesson's custom module. No turtle object is needed:
from custom import *

TForward(100)
TLeft(90)

TForward and TLeft control one shared drawing turtle. color("blue") and
speed(3) change that same turtle. Use for/range for repeated commands.
ReadyToRace() prepares Blue, Pink, Yellow and Green; move them with
BlueForward/PinkForward/YellowForward/GreenForward and turn them with
BlueLeft/PinkLeft/YellowLeft/GreenLeft. BlueX/PinkX/YellowX/GreenX report
each racer's horizontal position. Keep the parentheses, e.g. BlueX().

Install Python 3 with Tk support (python.org; Linux: python3-tk).
Keep main.py, custom.py and shape.py together, then run: python3 main.py
Add these two lines at the END of main.py to keep the local window open:
import turtle
turtle.done()

The Cove page holds the display automatically. Local Python does not.
The racing helpers intentionally leave loops, conditions and winner selection
to your code. The finish line is x=330; the lesson checks X() > 330.
`;
