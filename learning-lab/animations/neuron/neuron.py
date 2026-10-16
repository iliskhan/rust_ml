"""RustML: one neuron, two weighted inputs, one change of bias. 44 seconds.

Numerical results come from the TypeScript fixture; Python only composes the
explanation. The lower screen area remains clear for captions and controls.
"""

import json
from pathlib import Path

import manimgx as m


m.config.background_color = "#101622"

INK = "#F1F5F9"
MUTED = "#BBC8DB"
FIRST = "#75DFFF"
SECOND = "#F5C66A"
BIAS = "#BFADFF"
RESULT = "#8CE6B0"


def text(words, x=0, y=0, size=76, color=INK):
    return m.Text(words, font="sans-serif", font_size=size, color=color).move_to([x, y, 0])


def math(expression, x=0, y=0, size=100, color=INK):
    return m.MathTex(expression, font_size=size, color=color).move_to([x, y, 0])


class NeuronActivation(m.Scene):
    def construct(self):
        fixture = json.loads(Path(__file__).with_name("fixture.json").read_text(encoding="utf-8"))
        initial, final = fixture["initial"], fixture["final"]
        x1, x2 = (format(v, ".10g") for v in fixture["inputs"])
        w1, w2 = (format(v, ".10g") for v in fixture["weights"])
        c1, c2 = (format(v, ".10g") for v in fixture["contributions"])
        b0, z0, a0 = (format(initial[k], ".10g") for k in ("bias", "z", "output"))
        b1, z1, a1 = (format(final[k], ".10g") for k in ("bias", "z", "output"))

        # 00:00–00:10 — keep each weighted contribution on its own row.
        title = text("Нейрон: от входов к выходу", y=3.05, size=70)
        row1 = math(rf"x_1={x1},\quad w_1={w1}", x=-3.1, y=1.15, size=76, color=FIRST)
        row2 = math(rf"x_2={x2},\quad w_2={w2}", x=-3.1, y=-0.45, size=76, color=SECOND)
        term1 = math(rf"{x1}\cdot{w1}={c1}", x=4.1, y=1.15, size=76, color=FIRST)
        term2 = math(rf"{x2}\cdot({w2})={c2}", x=4.1, y=-0.45, size=76, color=SECOND)
        arrow1 = m.Arrow([row1.get_right()[0] + 0.25, 1.15, 0],
                         [term1.get_left()[0] - 0.25, 1.15, 0], buff=0, color=FIRST, stroke_width=7)
        arrow2 = m.Arrow([row2.get_right()[0] + 0.25, -0.45, 0],
                         [term2.get_left()[0] - 0.25, -0.45, 0], buff=0, color=SECOND, stroke_width=7)
        note = text("Каждый вход умножаем на его вес", y=-1.4, size=48, color=MUTED)
        self.play(m.FadeIn(title), run_time=0.6)
        self.play(m.Write(row1), run_time=0.8)
        self.play(m.Create(arrow1), run_time=0.6)
        self.play(m.Write(term1), run_time=0.6)
        self.wait(1.4)
        self.play(m.Write(row2), run_time=0.8)
        self.play(m.Create(arrow2), run_time=0.6)
        self.play(m.Write(term2), run_time=0.6)
        self.wait(2.2)
        self.play(m.FadeIn(note), run_time=0.6)
        self.wait(0.6)
        self.play(m.FadeOut(title), m.FadeOut(row1), m.FadeOut(row2),
                  m.FadeOut(arrow1), m.FadeOut(arrow2), m.FadeOut(term1),
                  m.FadeOut(term2), m.FadeOut(note), run_time=0.6)

        # 00:10–00:18 — summation is separate from activation.
        title = text("Сложим вклады и смещение", y=3.05, size=70)
        formula = math(r"z=x_1w_1+x_2w_2+b", y=1.1, size=96)
        numeric = math(rf"z={c1}+({c2})+{b0}={z0}", y=1.1, size=100)
        bias = math(rf"b={b0}", y=-0.55, size=90, color=BIAS)
        note = text("z — число до активации", y=-1.4, size=54, color=MUTED)
        self.play(m.FadeIn(title), run_time=0.6)
        self.play(m.Write(formula), m.FadeIn(bias), run_time=0.8)
        self.wait(1.6)
        self.play(m.ReplacementTransform(formula, numeric), m.FadeIn(note), run_time=0.8)
        self.wait(3.6)
        self.play(m.FadeOut(title), m.FadeOut(numeric), m.FadeOut(bias), m.FadeOut(note), run_time=0.6)

        # Actual ReLU coordinates: horizontal z, vertical a. Geometry is a
        # display transform only; the curve and points use fixture outputs.
        def point(z, a):
            return [3.3 + 1.15 * z, -0.9 + 1.4 * a, 0]

        axes = m.VGroup(
            m.Arrow(point(-2.2, 0), point(2.25, 0), buff=0, color=MUTED, stroke_width=3),
            m.Arrow(point(0, -0.15), point(0, 2.15), buff=0, color=MUTED, stroke_width=3),
            math("z", x=6.05, y=-0.85, size=58, color=MUTED),
            math("a", x=3.3, y=2.45, size=58, color=MUTED),
            math("0", x=3.02, y=-1.25, size=44, color=MUTED),
            math("-1", x=2.15, y=-1.25, size=44, color=MUTED),
            math("1", x=4.45, y=-1.25, size=44, color=MUTED),
            math("1", x=3.02, y=0.5, size=44, color=MUTED),
        )
        curve = fixture["curve"]
        graph = m.VGroup(axes, *(
            m.Line(point(left["z"], left["output"]), point(right["z"], right["output"]),
                   color=RESULT, stroke_width=8)
            for left, right in zip(curve, curve[1:])
        ))
        marker = m.Dot(point(initial["z"], initial["output"]), radius=0.13, color=FIRST)
        relu = math(r"a=\max(0,z)", x=-3.3, y=1.55, size=80, color=RESULT)
        unknown = math(rf"z={z0}\quad a=?", x=-3.3, y=0.05, size=88)
        answer = math(rf"z={z0}\quad a={a0}", x=-3.3, y=0.05, size=88, color=FIRST)

        # 00:18–00:26 — prediction pause, then reveal the zero branch.
        title = text("ReLU оставит какое число?", y=3.05, size=70)
        question = text("Подумайте до ответа", x=-3.3, y=-1.35, size=46, color=MUTED)
        self.play(m.FadeIn(title), m.Create(graph), m.FadeIn(relu), run_time=0.8)
        self.play(m.FadeIn(question), run_time=0.6)
        self.play(m.Write(unknown), run_time=0.6)
        self.wait(3.4)
        self.play(m.ReplacementTransform(unknown, answer), m.FadeIn(marker), run_time=0.8)
        self.wait(1.2)
        self.play(m.FadeOut(title), m.FadeOut(question), run_time=0.6)

        # 00:26–00:38 — only bias changes; the same point moves on ReLU.
        title = text("Меняем только смещение", y=3.05, size=72)
        bias = math(rf"b:{b0}\longrightarrow {b1}", x=-3.3, y=-1.35, size=78, color=BIAS)
        positive = math(rf"z={z1}\quad a={a1}", x=-3.3, y=0.05, size=88, color=RESULT)
        relation = math(rf"{c1}+({c2})+{b1}={z1}", x=-3.3, y=-1.35, size=76, color=BIAS)
        guide = m.VGroup(
            m.Line(point(final["z"], 0), point(final["z"], final["output"]), color=BIAS, stroke_width=3),
            m.Line(point(0, final["output"]), point(final["z"], final["output"]), color=BIAS, stroke_width=3),
        )
        self.play(m.FadeIn(title), run_time=0.6)
        self.play(m.FadeIn(bias), run_time=0.8)
        self.wait(1.6)
        # Hide endpoint numbers while moving. Each segment stays on ReLU;
        # final numbers appear only after the marker reaches the final state.
        self.remove(answer)
        self.play(marker.animate.move_to(point(0, 0)), run_time=0.6)
        self.play(marker.animate.move_to(point(final["z"], final["output"])).set_color(RESULT),
                  run_time=0.6)
        self.remove(bias)
        self.add(positive, relation)
        self.wait(1.8)
        self.play(m.Create(guide), run_time=0.6)
        branch = text("При z > 0 выход равен z", y=3.05, size=66, color=RESULT)
        self.play(m.ReplacementTransform(title, branch), run_time=0.8)
        self.wait(4.0)
        self.play(m.FadeOut(relu), m.FadeOut(positive), m.FadeOut(relation),
                  m.FadeOut(graph), m.FadeOut(marker), m.FadeOut(guide), m.FadeOut(branch), run_time=0.6)

        # 00:38–00:44 — transfer to the real controls below the video.
        title = text("Те же входы и веса. Меняем b", y=1.6, size=70)
        prompt = text("Когда выход будет больше нуля?", y=0.2, size=60, color=BIAS)
        destination = text("Предскажите и проверьте в лаборатории", y=-1.2, size=54, color=MUTED)
        self.play(m.FadeIn(title), m.FadeIn(prompt), run_time=0.6)
        self.wait(2.2)
        self.play(m.FadeIn(destination), run_time=0.6)
        self.wait(2.6)
