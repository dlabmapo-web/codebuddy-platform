// Exercises the shipped helper source against real CPython/Tk in Docker.
import { spawnSync } from 'node:child_process';
import { turtleCustomSource, turtleShapeSource, turtleRunnerSource } from '../../shared/dist/turtle-trial/bundle.js';
import { turtlePreamble, turtleStarters, turtleSpiralExample } from '../../shared/dist/turtle-trial/index.js';
const sources = Buffer.from(JSON.stringify({ custom: turtleCustomSource, shape: turtleShapeSource })).toString('base64');
const examples = Buffer.from(JSON.stringify({ square: turtleStarters.drawing, spiral: turtleSpiralExample })).toString('base64');
const test = `import base64, json, types, sys, time, tkinter, turtle, math
for attempt in range(100):
    try:
        root = tkinter.Tk(); root.destroy(); break
    except tkinter.TclError:
        time.sleep(0.05)
else:
    raise RuntimeError("Display did not become ready")
for name, source in json.loads(base64.b64decode("${sources}")).items():
    module = types.ModuleType(name)
    sys.modules[name] = module
    exec(compile(source, name + ".py", "exec"), module.__dict__)
assert turtle._Screen._root is None, "Imports must not create a screen"
import custom, shape
try:
    custom.BlueForward(10)
    raise AssertionError("Missing race setup was accepted")
except RuntimeError as error:
    assert "ReadyToRace" in str(error)
custom.color("blue")
assert turtle.pensize() == 5
assert turtle.shapesize() == (2, 2, 2)
assert turtle.speed() == 1
assert turtle.Screen().delay() == 30
custom.speed(3)
assert custom.speed() == 3, "The lesson's speed() call should report the current speed"
custom.TForward(10)
assert turtle.speed() == 3, "Movement must preserve an explicit speed"
custom.speed(0)
custom.TForward(10)
assert turtle.speed() == 0, "Instant drawing must remain available"
# Execute the shipped beginner programs unchanged. No student-side Turtle()
# construction or turtle import is needed. Disable only test animation delays.
lesson_examples = json.loads(base64.b64decode("${examples}"))
for name, source in lesson_examples.items():
    turtle.reset()
    turtle.Screen().tracer(0)
    student = {"__name__": "__main__"}
    exec(compile(source, "main.py", "exec"), student)
    assert "turtle" not in student and "_t" not in student
    assert len(turtle.Screen().turtles()) == 1, "Commands must share one turtle"
    if name == "square":
        assert turtle.distance(0, 0) < 0.00001
        assert abs(turtle.heading()) < 0.00001
    else:
        expected_x = sum(i * 4 * math.cos(math.radians(i * 59)) for i in range(45))
        expected_y = sum(i * 4 * math.sin(math.radians(i * 59)) for i in range(45))
        assert math.isclose(turtle.xcor(), expected_x, abs_tol=0.00001)
        assert math.isclose(turtle.ycor(), expected_y, abs_tol=0.00001)
        assert turtle.pencolor() == "blue"
        assert turtle.speed() == 3
    turtle.Screen().tracer(1, 0)
for sides in (3, 4, 5, 6, 7, 12):
    turtle.reset(); custom.speed(0); custom.color("red")
    for i in range(sides):
        custom.TForward(50); custom.TLeft(360 / sides)
    assert turtle.distance(0, 0) < 0.00001, sides
    assert turtle.pencolor() == "red"
for source in (
    "for i in range(5):\\n    TForward(100)\\n    TLeft(144)\\n",
    "for i in range(4):\\n    for j in range(4):\\n        TForward(100)\\n        TLeft(90)\\n    TLeft(90)\\n",
):
    turtle.reset(); custom.speed(0)
    student = {}
    exec("from custom import *\\n" + source, student)
    assert turtle.distance(0, 0) < 0.00001
    assert abs(turtle.heading()) < 0.00001
for bad in (True, "100", float("nan"), float("inf")):
    try:
        custom.TForward(bad)
        raise AssertionError("Invalid number was accepted")
    except ValueError:
        pass
custom.ReadyToRace()
assert len(custom._racers) == 4
# The complete student race uses wildcard imports, randint, while/if/break,
# and color-named commands without exposing or constructing turtle objects.
student = {}
exec(${JSON.stringify(turtlePreamble)}, student)
for pen in custom._racers.values(): pen.speed(0)
turtle.Screen().tracer(0)
exec("BlueForward(50)\\nPinkForward(100)\\nYellowForward(150)\\nGreenForward(200)\\n", student)
assert [custom._racers[name].xcor() for name in ("Blue", "Pink", "Yellow", "Green")] == [-350, -300, -250, -200]
import random
random.seed(42)
exec("""steps = 0
while True:
    BlueForward(randint(1, 20))
    PinkForward(randint(1, 20))
    YellowForward(randint(1, 20))
    GreenForward(randint(1, 20))
    steps += 1
    if BlueX() > 330:
        break
    if PinkX() > 330:
        break
    if YellowX() > 330:
        break
    if GreenX() > 330:
        break
    assert steps < 150
""", student)
assert any(pen.xcor() > 330 for pen in custom._racers.values())
assert "turtle" not in student and "_t" not in student
custom.ReadyToRace()
assert math.isclose(turtle.Screen().xscale, turtle.Screen().yscale, rel_tol=0.000000001), "Race world units must have equal scale"
for name in ("Blue", "Pink", "Yellow", "Green"):
    assert getattr(custom, name + "X")() == -400
    assert custom._racers[name].pensize() == 5
    assert custom._racers[name].shapesize() == (2, 2, 2)
    assert custom._racers[name].speed() == 1
custom.BlueForward(-20)
assert custom.BlueX() == -420
assert custom.PinkX() == -400
custom.BlueLeft(90)
custom.BlueForward(10)
assert abs(custom.BlueX() + 420) < 0.00001
custom.ReadyToRace()
assert len(custom._racers) == 4
custom.BlueForward(740)
assert custom.BlueX() > 330
for i in range(36): custom.BlueLeft(10)
assert abs(custom._racers["Blue"].heading()) < 0.00001
before = len(turtle.Screen().turtles())
shape.CircleTurtle(); shape.CircleTurtle()
assert len(turtle.Screen().turtles()) == before + 1
assert "_racers" not in custom.__all__
assert "_t" not in custom.__all__ and "_pen" not in custom.__all__
# Run the actual guest bootstrap, replacing only the user-file loader.
import runpy
original_run = runpy.run_path
def verify_standard_turtles(*args, **kwargs):
    screen = turtle.Screen()
    screen.clearscreen()
    pen = turtle.Turtle("turtle")
    assert isinstance(pen, turtle.Turtle), "Keep standard class identity"
    assert pen.pensize() == 5
    assert pen.shapesize() == (2, 2, 2)
    pen.pensize(9); pen.shapesize(3, 3, 1)
    pen.forward(1)
    assert pen.pensize() == 9, "Honor explicit pen settings"
    assert pen.shapesize() == (3, 3, 1)
    for width in (1, 2, 3, 8):
        pen.pensize(width)
        pen.forward(5)
        assert pen.pensize() == width, "Keep Python pen values intact"
        rendered = float(screen.cv.itemcget(pen.currentLineItem, "width"))
        assert rendered == max(6, width * 2), (width, rendered)
    pen.width(3)
    pen.forward(5)
    assert pen.width() == 3
    assert float(screen.cv.itemcget(pen.currentLineItem, "width")) == 6
    pen.pen(pensize=2)
    pen.forward(5)
    assert pen.pen()["pensize"] == 2
    assert float(screen.cv.itemcget(pen.currentLineItem, "width")) == 6
    pen.reset()
    assert pen.pensize() == 5
    assert pen.shapesize() == (2, 2, 2)
    raw = turtle.RawTurtle(screen)
    assert raw.pensize() == 5
    assert raw.shapesize() == (2, 2, 2)
    turtle.color("green"); turtle.forward(1)
    assert turtle.pensize() == 5
    assert turtle.shapesize() == (2, 2, 2)
    turtle.bye()
runpy.run_path = verify_standard_turtles
try:
    exec(compile(base64.b64decode("${Buffer.from(turtleRunnerSource).toString('base64')}").decode(), "_cove_trial_runner.py", "exec"), {})
finally:
    runpy.run_path = original_run
print("PASS: custom-only square/spiral, polygons, fractional turns, star, nested loops, shared color/speed, argument validation, complete random race, race reset, negative movement, finish line, celebration, optional demo, import isolation, guest rendering")
`;
const result = spawnSync('docker', ['run', '--rm', '-i', '--network', 'none', '--memory', '512m', '--pids-limit', '64', '--entrypoint', '/bin/sh', 'cove-turtle-trial:dev', '-c', 'Xvfb :99 -screen 0 1024x640x24 -nolisten tcp >/dev/null 2>&1 & python3 -u -'], { input: test, encoding: 'utf8', timeout: 60000 });
process.stdout.write(result.stdout ?? ''); process.stderr.write(result.stderr ?? '');
process.exit(result.status ?? 1);
