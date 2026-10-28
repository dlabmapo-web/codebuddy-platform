"""Pure model tests with the actual shipped native helpers, not rewritten fixtures."""
import importlib.util
import pathlib
import re
import sys
import types
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUNDLE = (ROOT.parent / 'shared/src/turtle-trial/bundle.ts').read_text()


class ModelContract(unittest.TestCase):
    def setUp(self):
        spec = importlib.util.spec_from_file_location('turtle', ROOT / 'src/turtle.py')
        self.t = importlib.util.module_from_spec(spec)
        sys.modules['turtle'] = self.t
        spec.loader.exec_module(self.t)
        self.events = []
        self.t._sink = lambda batch: self.events.extend(batch)
        for name, constant in [('custom', 'turtleCustomSource'), ('shape', 'turtleShapeSource')]:
            module = types.ModuleType(name)
            sys.modules[name] = module
            exec(re.search(r'export const ' + constant + r' = String.raw`([\s\S]*?)`;', BUNDLE)[1], module.__dict__)
        self.custom, self.shape = sys.modules['custom'], sys.modules['shape']

    def finish(self): self.t._flush()

    def test_shipped_drawing_defaults_and_shared_pen(self):
        for _ in range(4): self.custom.TForward(100); self.custom.TLeft(90)
        self.finish()
        pen = self.t.getturtle()
        self.assertAlmostEqual(pen.xcor(), 0); self.assertAlmostEqual(pen.ycor(), 0)
        self.assertEqual(pen.heading(), 0); self.assertEqual(pen.pensize(), 5)
        self.assertEqual(pen.speed(), 1); self.assertEqual(pen.shape(), 'turtle')
        self.assertEqual(len([e for e in self.events if e['op'] == 'line']), 4)
        self.assertTrue(all(e['duration'] > 0 for e in self.events if e['op'] == 'line'))

    def test_shipped_racing_positions_queries_and_reset(self):
        c = self.custom; c.ReadyToRace()
        self.assertEqual([getattr(c, x + 'X')() for x in ['Blue', 'Pink', 'Yellow', 'Green']], [-400] * 4)
        c.BlueForward(70); c.PinkForward(30)
        self.assertEqual(c.BlueX(), -330); self.assertEqual(c.PinkX(), -370)
        c.BlueLeft(180); c.BlueForward(15)
        self.assertAlmostEqual(c.BlueX(), -345)
        c.ReadyToRace(); self.assertEqual(c.BlueX(), -400)
        self.assertEqual(self.t.Screen().bgcolor(), '#e8f2f5')
        self.assertEqual(len(self.t.Screen().turtles()), 5)

    def test_argument_validation_and_unprepared_racers(self):
        for value in [True, float('inf'), float('nan'), '20', None]:
            with self.subTest(value=value), self.assertRaises(ValueError): self.custom.TForward(value)
        for value in [-1, 11, 1.5, True]:
            with self.subTest(speed=value), self.assertRaises(ValueError): self.custom.speed(value)
        with self.assertRaises(RuntimeError): self.custom.BlueForward(1)

    def test_position_aliases_penup_colors_and_heading(self):
        p = self.t.Turtle(); p.pu(); p.goto((10, 20)); p.seth(90); p.fd(-5)
        self.assertAlmostEqual(p.ycor(), 15); self.assertAlmostEqual(p.xcor(), 10)
        p.pd(); p.color('red', 'blue'); p.width(7); p.backward(20)
        self.assertEqual(p.color(), ('red', 'blue')); self.assertTrue(p.isdown())
        p.home(); self.assertEqual(p.pos(), (0, 0)); self.assertEqual(p.heading(), 0)

    def test_curve_closure_and_extent_direction(self):
        for radius in [65, -65]:
            p = self.t.Turtle(); p.speed(0); p.circle(radius)
            self.assertAlmostEqual(p.xcor(), 0, places=8); self.assertAlmostEqual(p.ycor(), 0, places=8)
            p.circle(radius, 180)
            self.assertAlmostEqual(p.xcor(), 0, places=8); self.assertAlmostEqual(p.ycor(), 2 * radius, places=8)

    def test_shipped_circle_and_fill_stream(self):
        self.shape.CircleTurtle(); self.finish()
        self.assertTrue(any(e['op'] == 'line' for e in self.events))
        p = self.t.Turtle(); p.begin_fill(); p.forward(10); p.left(90); p.forward(10); p.end_fill(); self.finish()
        fill = [e for e in self.events if e['op'] == 'fill'][-1]
        self.assertEqual(len(fill['points']), 3)
        self.assertTrue(any(e['op'] == 'fillStart' and e['id'] == p._id for e in self.events))

    def test_output_order_and_utf8_budget(self):
        p = self.t.Turtle(); p.forward(1); self.t._output('done'); self.finish()
        self.assertLess(next(i for i, e in enumerate(self.events) if e['op'] == 'line'), next(i for i, e in enumerate(self.events) if e['op'] == 'output'))
        with self.assertRaises(RuntimeError): self.t._output('한' * 90000)

    def test_boundaries_do_not_silently_fake_unsupported_features(self):
        p = self.t.Turtle()
        for call in [lambda: p.onclick(lambda: None), lambda: self.t.Screen().getcanvas(), lambda: p.write('x', move=True), lambda: p.shape('remote.gif')]:
            with self.assertRaises(self.t.UnsupportedFeature): call()
        for value in [float('nan'), float('inf'), 1e99]:
            with self.assertRaises(ValueError): p.goto(value, 0)
        with self.assertRaises(ValueError): p.speed('not-a-speed')

    def test_screen_text_visibility_colors_and_explicit_pen_overrides(self):
        t = self.t; screen = t.Screen(); screen.setup(); screen.title('local title')
        self.assertEqual((screen.window_width(), screen.window_height()), (1024, 640))
        screen.delay(10); self.assertEqual(screen.delay(), 10)
        t.tracer(0); self.assertEqual(screen.tracer(), 0)
        t.setworldcoordinates(-100, -50, 100, 50); t.bgcolor(0, 1, 0)
        p = t.Turtle(); p.speed('fastest'); p.pensize(1); p.shapesize(3, 4, 2); p.hideturtle()
        self.assertFalse(p.isvisible()); self.assertEqual(p.shapesize(), (3, 4, 2))
        p.showturtle(); self.assertTrue(p.isvisible()); p.color((1, 0, 0)); self.assertEqual(p.pencolor(), '#ff0000')
        p.forward(5); p.write('UTF-8 안녕', align='center', font=('Arial', 12, 'bold'))
        t.update(); self.finish()
        self.assertEqual([e for e in self.events if e['op'] == 'line'][-1]['width'], 1)
        self.assertEqual([e for e in self.events if e['op'] == 'text'][-1]['text'], 'UTF-8 안녕')
        self.assertEqual(screen.turtles(), [p])
        p.begin_fill(); p.forward(1); p.clear(); self.assertFalse(p.filling()); p.end_fill()
        p.hideturtle(); p.reset(); self.assertTrue(p.isvisible()); self.assertEqual(p.position(), (0, 0)); self.assertEqual(p.pensize(), 5)
        t.clearscreen(); self.assertEqual(t.turtles(), []); self.assertEqual(t.tracer(), 1)
        self.assertEqual(t.Screen().bgcolor(), 'white')

    def test_all_four_racers_keep_independent_heading_and_forward_queries(self):
        c = self.custom; c.ReadyToRace()
        for index, name in enumerate(['Blue', 'Pink', 'Yellow', 'Green']):
            getattr(c, name + 'Forward')(index + 1)
            self.assertAlmostEqual(getattr(c, name + 'X')(), -399 + index)
            getattr(c, name + 'Left')(180); getattr(c, name + 'Forward')(index + 1)
            self.assertAlmostEqual(getattr(c, name + 'X')(), -400)

    def test_default_state_is_fresh_between_modules(self):
        self.custom.TForward(20); self.custom.color('blue')
        self.setUp()
        self.assertEqual(self.t.getturtle().position(), (0, 0)); self.assertEqual(self.t.getturtle().pencolor(), 'black')


if __name__ == '__main__': unittest.main()
