"""Cove's bounded drawing model. No DOM, Tk, network or student execution here."""
import math as _math


class UnsupportedFeature(RuntimeError):
    pass


class TurtleGraphicsError(ValueError):
    pass


_sink = None
_batch = []
_operations = 0
_bytes = 0
_output_bytes = 0
_next_id = 0
_default = None
_MAX_OPERATIONS = 50000
_MAX_BYTES = 8388608
_NAMED = {"black", "white", "red", "green", "blue", "yellow", "pink", "orange",
          "purple", "brown", "gray", "grey", "cyan", "magenta", "navy", "lime",
          "gold", "violet", "turquoise", "darkgreen", "lightblue", "lightgray"}


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not _math.isfinite(value):
        raise TurtleGraphicsError("Expected a finite number")
    if abs(value) > 1000000:
        raise TurtleGraphicsError("Drawing coordinate limit exceeded")
    return value


def _color(value):
    if isinstance(value, (tuple, list)) and len(value) == 3:
        channels = [_number(v) for v in value]
        if any(v < 0 or v > 1 for v in channels):
            raise TurtleGraphicsError("RGB channels must be between 0 and 1")
        return "#" + "".join(format(round(v * 255), "02x") for v in channels)
    if isinstance(value, str):
        if value.lower() in _NAMED:
            return value.lower()
        if len(value) in (4, 7) and value[0] == "#" and all(c in "0123456789abcdefABCDEF" for c in value[1:]):
            return value
    raise UnsupportedFeature("This color is not supported by browser drawing; use full Python")


def _flush():
    global _batch
    if _batch and _sink:
        pending = _batch
        _batch = []
        _sink(pending)


def _emit(event):
    global _operations, _bytes
    # Serialized size is bounded again at the worker/renderer boundary.
    _operations += max(1, len(event['points'])) if event['op'] == 'fill' else max(1, len(event['text'])) if event['op'] == 'text' else 1
    _bytes += len(str(event).encode("utf-8"))
    if _operations > _MAX_OPERATIONS or _bytes > _MAX_BYTES:
        raise RuntimeError("Drawing limit exceeded")
    if len(str(event).encode("utf-8")) > 60000:
        raise RuntimeError("Drawing event limit exceeded")
    _batch.append(event)
    if len(_batch) >= 64:
        _flush()


def _output(text):
    global _output_bytes
    _output_bytes += len(text.encode("utf-8"))
    if _output_bytes > 262144:
        raise RuntimeError("Output limit exceeded")
    # Preserve the position of output in the drawing/animation timeline.
    for start in range(0, len(text), 4096):
        _emit({"op": "output", "text": text[start:start + 4096]})


class _Screen:
    def __init__(self):
        self._pens = []
        self._delay = 25
        self._tracing = 1
        self._background = "white"
        self._world = (-512, -320, 512, 320)

    def setup(self, width=1.0, height=1.0, startx=None, starty=None):
        if width != 1.0 or height != 1.0 or startx is not None or starty is not None:
            raise UnsupportedFeature("Custom desktop windows require full Python")

    def title(self, title):
        return None

    def window_width(self): return 1024
    def window_height(self): return 640
    def turtles(self): return self._pens[:]

    def delay(self, value=None):
        if value is None: return self._delay
        if not 0 <= _number(value) <= 1000: raise TurtleGraphicsError("Delay out of range")
        self._delay = value

    def tracer(self, n=None, delay=None):
        if n is None: return self._tracing
        if not isinstance(n, int) or n < 0: raise TurtleGraphicsError("Invalid tracer value")
        self._tracing = n
        _emit({"op": "tracer", "value": n})
        if delay is not None: self.delay(delay)

    def update(self):
        _emit({"op": "update"})
        _flush()

    def bgcolor(self, *value):
        if not value: return self._background
        self._background = _color(value[0] if len(value) == 1 else value)
        _emit({"op": "background", "color": self._background})

    def setworldcoordinates(self, llx, lly, urx, ury):
        values = [_number(v) for v in (llx, lly, urx, ury)]
        if urx - llx < 0.000001 or ury - lly < 0.000001: raise TurtleGraphicsError("Invalid coordinate bounds")
        self._world = tuple(values)
        _emit({"op": "world", "bounds": values})

    def clearscreen(self):
        global _default
        self.__init__()
        _default = None
        _emit({"op": "clear", "id": None})
        _emit({"op": "background", "color": "white"})
        _emit({"op": "world", "bounds": list(self._world)})
        _emit({"op": "tracer", "value": 1})

    clear = clearscreen

    def __getattr__(self, name):
        raise UnsupportedFeature("Screen." + name + " requires full Python")


_screen = _Screen()


def Screen(): return _screen


class Turtle:
    def __init__(self, shape="classic", undobuffersize=1000, visible=True):
        global _next_id
        _next_id += 1
        if _next_id > 256: raise RuntimeError("Turtle count limit exceeded")
        self._id = _next_id
        self._x = self._y = self._heading = 0.0
        self._down = True
        self._pen = self._fill = "black"
        self._width = 5
        self._speed = 3
        self._shape = "classic"
        self._size = (2, 2, 2)
        self._visible = bool(visible)
        self._fillpath = None
        _screen._pens.append(self)
        self.shape(shape)

    def _cursor(self, duration=0):
        _emit({"op": "cursor", "id": self._id, "x": self._x, "y": self._y,
               "heading": self._heading, "shape": self._shape,
               "sx": self._size[1], "sy": self._size[0], "color": self._pen,
               "visible": self._visible, "duration": duration})

    def _duration(self, distance):
        if not self._speed or _screen._tracing != 1: return 0
        scale = 1024 / (_screen._world[2] - _screen._world[0])
        return min(120000, (1 + int(abs(distance * scale) / (3 * 1.1 ** self._speed * self._speed))) * _screen._delay)

    def goto(self, x, y=None):
        if y is None: x, y = x
        x, y = _number(x), _number(y)
        distance = _math.hypot(x - self._x, y - self._y)
        duration = self._duration(distance)
        if self._down:
            _emit({"op": "line", "id": self._id, "x1": self._x, "y1": self._y,
                   "x2": x, "y2": y, "color": self._pen, "width": self._width, "duration": duration})
        self._x, self._y = x, y
        if self._fillpath is not None: self._fillpath.append([x, y])
        self._cursor(0 if self._down else duration)

    setpos = setposition = goto

    def forward(self, distance):
        distance = _number(distance)
        angle = _math.radians(self._heading)
        self.goto(self._x + distance * _math.cos(angle), self._y + distance * _math.sin(angle))

    fd = forward
    def backward(self, distance): self.forward(-_number(distance))
    back = bk = backward

    def left(self, angle):
        angle = _number(angle)
        self._heading = (self._heading + angle) % 360
        self._cursor()

    lt = left
    def right(self, angle): self.left(-_number(angle))
    rt = right
    def heading(self): return self._heading
    def setheading(self, angle):
        self._heading = _number(angle) % 360
        self._cursor()
    seth = setheading
    def position(self): return (self._x, self._y)
    pos = position
    def xcor(self): return self._x
    def ycor(self): return self._y
    def home(self):
        self.goto(0, 0)
        self.setheading(0)
    def penup(self): self._down = False
    pu = up = penup
    def pendown(self): self._down = True
    pd = down = pendown
    def isdown(self): return self._down

    def pencolor(self, *value):
        if not value: return self._pen
        self._pen = _color(value[0] if len(value) == 1 else value)
        self._cursor()

    def fillcolor(self, *value):
        if not value: return self._fill
        self._fill = _color(value[0] if len(value) == 1 else value)

    def color(self, *value):
        if not value: return (self._pen, self._fill)
        if len(value) == 2:
            pen, fill = _color(value[0]), _color(value[1])
        else: pen = fill = _color(value[0] if len(value) == 1 else value)
        self._pen, self._fill = pen, fill
        self._cursor()

    def pensize(self, value=None):
        if value is None: return self._width
        if not 0 <= _number(value) <= 1000: raise TurtleGraphicsError("Invalid pen width")
        self._width = value
    width = pensize

    def speed(self, value=None):
        if value is None: return self._speed
        names = {"fastest": 0, "fast": 10, "normal": 6, "slow": 3, "slowest": 1}
        if isinstance(value, str):
            if value not in names: raise TurtleGraphicsError("Invalid speed name")
            value = names[value]
        value = _number(value)
        self._speed = int(round(value)) if 0.5 < value < 10.5 else 0

    def shape(self, value=None):
        if value is None: return self._shape
        if value not in ("classic", "turtle", "arrow", "circle", "square", "triangle", "blank"):
            raise UnsupportedFeature("Custom turtle shapes require full Python")
        self._shape = value
        self._cursor()

    def shapesize(self, stretch_wid=None, stretch_len=None, outline=None):
        if stretch_wid is None and stretch_len is None and outline is None: return self._size
        w = self._size[0] if stretch_wid is None else _number(stretch_wid)
        length = w if stretch_len is None else _number(stretch_len)
        border = self._size[2] if outline is None else _number(outline)
        if not 0 < w <= 100 or not 0 < length <= 100 or border < 0:
            raise TurtleGraphicsError("Invalid shape size")
        self._size = (w, length, border)
        self._cursor()
    turtlesize = shapesize

    def hideturtle(self):
        self._visible = False
        self._cursor()
    ht = hideturtle
    def showturtle(self):
        self._visible = True
        self._cursor()
    st = showturtle
    def isvisible(self): return self._visible

    def begin_fill(self):
        self._fillpath = [[self._x, self._y]]
        _emit({"op": "fillStart", "id": self._id})
    def end_fill(self):
        if self._fillpath is not None:
            _emit({"op": "fill", "id": self._id, "points": self._fillpath, "color": self._fill})
            self._fillpath = None
    def filling(self): return self._fillpath is not None

    def circle(self, radius, extent=None, steps=None):
        radius = _number(radius)
        extent = 360 if extent is None else _number(extent)
        if steps is None: steps = 1 + int(min(11 + abs(radius) / 6, 59) * abs(extent) / 360)
        if not isinstance(steps, int) or not 1 <= steps <= 10000:
            raise TurtleGraphicsError("Circle segment limit exceeded")
        turn = extent / steps
        length = 2 * radius * _math.sin(_math.radians(turn / 2))
        if radius < 0: turn, length = -turn, -length
        self.left(turn / 2)
        for _ in range(steps):
            self.forward(length)
            self.left(turn)
        self.right(turn / 2)

    def write(self, arg, move=False, align="left", font=("Arial", 8, "normal")):
        if move: raise UnsupportedFeature("Moving text requires full Python")
        text = str(arg)
        if len(text) > 1024: raise RuntimeError("Drawing text limit exceeded")
        if align not in ("left", "center", "right"): raise TurtleGraphicsError("Invalid alignment")
        family, size, style = font
        if family not in ("Arial", "DejaVu Sans", "sans-serif", "serif", "monospace"):
            raise UnsupportedFeature("This font requires full Python")
        if not 1 <= _number(size) <= 256 or style not in ("normal", "bold", "italic"):
            raise TurtleGraphicsError("Invalid font")
        _emit({"op": "text", "id": self._id, "x": self._x, "y": self._y,
               "text": text, "align": align, "font": [family, size, style], "color": self._pen})

    def clear(self):
        self._fillpath = None
        _emit({"op": "clear", "id": self._id})
    def reset(self):
        self.clear()
        self._x = self._y = self._heading = 0.0
        self._down = True
        self._pen = self._fill = "black"
        self._width, self._speed, self._size, self._shape = 5, 3, (2, 2, 2), "classic"
        self._visible = True
        self._fillpath = None
        self._cursor()

    def __getattr__(self, name):
        raise UnsupportedFeature("Turtle." + name + " requires full Python")


def getturtle():
    global _default
    if _default is None: _default = Turtle()
    return _default


def done(): _flush()
mainloop = done


def _forward(name):
    def method(*args, **kwargs): return getattr(getturtle(), name)(*args, **kwargs)
    return method


for _name in ("forward", "fd", "backward", "back", "bk", "left", "lt", "right", "rt",
              "goto", "setpos", "setposition", "home", "position", "pos", "xcor", "ycor",
              "heading", "setheading", "seth", "penup", "pu", "up", "pendown", "pd", "down",
              "isdown", "pencolor", "fillcolor", "color", "pensize", "width", "shape", "shapesize",
              "turtlesize", "speed", "circle", "begin_fill", "end_fill", "filling", "write",
              "clear", "reset", "hideturtle", "ht", "showturtle", "st", "isvisible"):
    globals()[_name] = _forward(_name)

for _name in ("setup", "title", "delay", "bgcolor", "window_width", "window_height",
              "setworldcoordinates", "tracer", "update", "clearscreen", "turtles"):
    globals()[_name] = getattr(_screen, _name)


def __getattr__(name):
    if name.startswith("__"): raise AttributeError(name)
    raise UnsupportedFeature("turtle." + name + " requires full Python")
