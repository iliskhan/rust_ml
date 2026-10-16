"""Two coordinate arrows, exact circular rotations, and a four-coordinate dot."""
import json
from pathlib import Path
import manimgx as m

m.config.background_color = "#101622"
INK, MUTED, Q, K, RESULT = "#F1F5F9", "#BBC8DB", "#75DFFF", "#F5C66A", "#8CE6B0"


def text(words, x=0, y=0, size=60, color=INK):
    return m.Text(words, font="sans-serif", font_size=size, color=color).move_to([x, y, 0])


def math(words, x=0, y=0, size=76, color=INK):
    return m.MathTex(words, font_size=size, color=color).move_to([x, y, 0])


class RopeRotation(m.Scene):
    def construct(self):
        f = json.loads(Path(__file__).with_name("fixture.json").read_text(encoding="utf-8"))
        initial, shifted, changed = f["initial"], f["shifted"], f["changed"]
        origin = [-3.65, 0.45, 0]

        def point(v):
            return [origin[0] + 1.35 * v[0], origin[1] + 1.35 * v[1], 0]

        def arrow(v, color):
            return m.Arrow(origin, point(v[:2]), buff=0, color=color, stroke_width=8)

        axes = m.VGroup(
            m.Arrow(point([-1.6, 0]), point([1.6, 0]), buff=0, color=MUTED, stroke_width=2),
            m.Arrow(point([0, -1.35]), point([0, 1.6]), buff=0, color=MUTED, stroke_width=2),
            # Keep labels outside the whole circular sweep of both vectors.
            text("коорд. 0", x=-0.75, y=0.0, size=32, color=MUTED),
            text("коорд. 1", x=-4.7, y=2.65, size=32, color=MUTED),
        )
        q, k = arrow(f["q"], Q), arrow(f["k"], K)

        # 0–8. Two actual coordinates; position is an angle, never another axis.
        title = text("RoPE поворачивает пары", y=3.5, size=70)
        info = m.VGroup(text("Q · запрос", x=3.1, y=2.25, size=55, color=Q),
                        text("K · ключ", x=3.1, y=1.35, size=55, color=K),
                        text("Показана пара 0–1", x=3.1, y=0.3, size=48),
                        text("Позиция задаёт угол", x=3.1, y=-0.65, size=48, color=MUTED))
        self.play(m.FadeIn(title), m.Create(axes), run_time=0.6)
        self.play(m.Create(q), m.Create(k), m.FadeIn(info), run_time=0.8)
        self.wait(6.0)
        self.play(m.FadeOut(info), m.FadeOut(title), run_time=0.6)

        # 8–18. Rotate follows a circular path about the common coordinate origin.
        title = text("Q: позиция 1 · K: позиция 3", y=3.5, size=62)
        angles = m.VGroup(math(r"\theta_Q=1,\quad\theta_K=3", x=3.1, y=2.15, size=68),
                          text("Углы — в радианах", x=3.1, y=1.15, size=46, color=MUTED))
        self.play(m.FadeIn(title), m.FadeIn(angles), run_time=0.6)
        self.play(m.Rotate(q, f["rotationAngles"]["initialQ"], about_point=origin),
                  m.Rotate(k, f["rotationAngles"]["initialK"], about_point=origin), run_time=2.4)
        summary = m.VGroup(math(r"\Delta=3-1=2", x=3.1, y=0.1, size=76),
                            math(rf"Q'\cdot K'\approx {initial['dot']:.3f}", x=3.1, y=-0.95, size=68, color=RESULT))
        note = text("Все 4 координаты Q и K", x=3.1, y=-1.5, size=32, color=MUTED)
        self.play(m.FadeIn(summary), m.FadeIn(note), run_time=0.6)
        self.wait(5.8)
        self.play(m.FadeOut(title), m.FadeOut(angles), run_time=0.6)

        # 18–26. No answer appears during the prediction pause.
        title = text("Сдвинем обе позиции на 2", y=3.5, size=66)
        question = m.VGroup(text("Q: 1 → 3    K: 3 → 5", x=3.1, y=2.1, size=49),
                           text("Изменится Q′ · K′?", x=3.1, y=1.1, size=54, color=Q))
        self.play(m.FadeIn(title), m.FadeIn(question), run_time=0.6)
        self.wait(6.8)
        self.play(m.FadeOut(title), m.FadeOut(question), m.FadeOut(summary), run_time=0.6)

        # 26–38. A rigid simultaneous turn preserves angle and dot.
        title = text("Общий сдвиг сохраняет ответ", y=3.5, size=64)
        rule = m.VGroup(text("Обе стрелки: ещё 2 радиана", x=3.1, y=2.1, size=43),
                        math(r"\Delta=5-3=2", x=3.1, y=1.0, size=76))
        self.play(m.FadeIn(title), m.FadeIn(rule), run_time=0.6)
        self.play(m.Rotate(q, f["rotationAngles"]["commonShift"], about_point=origin),
                  m.Rotate(k, f["rotationAngles"]["commonShift"], about_point=origin), run_time=2.4)
        result = math(rf"Q'\cdot K'\approx {shifted['dot']:.3f}", x=3.1, y=-0.1, size=68, color=RESULT)
        slow = text("Пара 2–3: в 100 раз медленнее", x=3.1, y=-1.05, size=33, color=MUTED)
        self.play(m.FadeIn(result), m.FadeIn(slow), run_time=0.6)
        self.wait(7.8)
        self.play(m.FadeOut(title), m.FadeOut(rule), m.FadeOut(result), m.FadeOut(slow), run_time=0.6)

        # 38–46. Only K moves; the relative position and full dot now change.
        title = text("Изменим только позицию K", y=3.5, size=66)
        rule = m.VGroup(text("Q: 3    K: 5 → 7", x=3.1, y=2.1, size=50),
                        math(r"\Delta=7-3=4", x=3.1, y=1.0, size=76))
        self.play(m.FadeIn(title), m.FadeIn(rule), run_time=0.6)
        self.play(m.Rotate(k, f["rotationAngles"]["keyOnly"], about_point=origin), run_time=1.8)
        result = math(rf"Q'\cdot K'\approx {changed['dot']:.3f}", x=3.1, y=-0.2, size=68, color=RESULT)
        self.play(m.FadeIn(result), run_time=0.6)
        self.wait(4.4)
        self.play(m.FadeOut(title), m.FadeOut(rule), m.FadeOut(result), m.FadeOut(note),
                  m.FadeOut(axes), m.FadeOut(q), m.FadeOut(k), run_time=0.6)

        # 46–50. Transfer without claiming semantic or whole-model invariance.
        final = m.VGroup(text("Проверьте общий сдвиг +5", y=2.1, size=67),
                         text("Затем измените расстояние", y=0.65, size=61, color=Q),
                         text("Исходные Q и K оставьте прежними", y=-0.85, size=47, color=MUTED))
        self.play(m.FadeIn(final), run_time=0.6)
        self.wait(3.4)
