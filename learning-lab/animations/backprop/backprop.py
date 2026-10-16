"""RustML: two paths into one gradient. ManimGX 0.1.1, 44 seconds.

All example values come from the sharedGraph fixture; this scene only lays
out the explanation. Run from any directory; see README.md for reproduction.
"""

import json
from pathlib import Path

import manimgx as m


m.config.background_color = "#101622"

INK = "#F1F5F9"
MUTED = "#BBC8DB"
SHARED = "#75DFFF"
SQUARE = "#F5C66A"
IDENTITY = "#BFADFF"
RESULT = "#8CE6B0"


def text(words, x=0, y=0, size=76, color=INK):
    return m.Text(words, font="sans-serif", font_size=size, color=color).move_to([x, y, 0])


def math(expression, x=0, y=0, size=100, color=INK):
    return m.MathTex(expression, font_size=size, color=color).move_to([x, y, 0])


def arrow(start, end, color):
    return m.Arrow(start, end, buff=0, color=color, stroke_width=7)


class BackpropSharedNode(m.Scene):
    def construct(self):
        fixture = json.loads(Path(__file__).with_name("fixture.json").read_text(encoding="utf-8"))
        v, g, c = fixture["values"], fixture["gradients"], fixture["qContributions"]

        def number(value):
            return format(value, ".10g")

        x, w, q, p, target, loss = (number(v[key]) for key in ("x", "w", "q", "p", "target", "loss"))
        gp, gq, gx, gw = (number(g[key]) for key in ("p", "q", "x", "w"))
        square, identity = number(c["square"]), number(c["identity"])

        # 00:00–00:12 — build dependencies in their forward direction.
        title = text("Один узел — два пути", y=3.05)
        inputs = math(rf"x={x},\quad w={w}", y=0.2)
        q_node = math(rf"q={q}", x=-4.4, color=SHARED)
        square_node = math(r"q^2", y=1.15, color=SQUARE)
        identity_node = math("q", y=-1.15, color=IDENTITY)
        p_node = math(rf"p={p}", x=4.4, color=RESULT)
        left_top = arrow([-2.9, 0.3, 0], [-0.9, 1.1, 0], SQUARE)
        left_bottom = arrow([-2.9, -0.3, 0], [-0.9, -1.1, 0], IDENTITY)
        right_top = arrow([0.9, 1.1, 0], [2.8, 0.3, 0], SQUARE)
        right_bottom = arrow([0.9, -1.1, 0], [2.8, -0.3, 0], IDENTITY)
        graph = m.VGroup(q_node, square_node, identity_node, p_node,
                         left_top, left_bottom, right_top, right_bottom)
        product = math(rf"q=xw={q}", y=-2.5, color=SHARED)
        sum_formula = math(rf"p=q^2+q={p}", y=-2.5, size=96)
        loss_formula = math(rf"L=\frac{{(p-{target})^2}}{{2}}={loss}", y=0, size=100)
        self.play(m.FadeIn(title), run_time=0.6)
        self.play(m.Write(inputs), run_time=0.8)
        self.wait(1.4)
        self.play(m.ReplacementTransform(inputs, q_node), m.FadeIn(product), run_time=0.8)
        self.play(m.Create(left_top), m.Create(left_bottom), run_time=0.8)
        self.play(m.FadeIn(square_node), m.FadeIn(identity_node), run_time=0.6)
        self.play(m.Create(right_top), m.Create(right_bottom), run_time=0.8)
        self.play(m.FadeIn(p_node), m.ReplacementTransform(product, sum_formula), run_time=0.6)
        self.wait(1.6)
        self.play(m.FadeOut(graph), run_time=0.3)
        self.play(m.ReplacementTransform(sum_formula, loss_formula), run_time=0.5)
        self.wait(2.6)
        self.play(m.FadeOut(title), m.FadeOut(loss_formula), run_time=0.6)

        # 00:12–00:18 — a real pause before revealing the two contributions.
        question = text("q чуть вырос. Что изменится?", y=3.05, size=66)
        prompt = text("Проследите оба пути", y=2.0, size=52)
        self.play(m.FadeIn(question), m.FadeIn(prompt), m.FadeIn(graph), run_time=0.6)
        self.wait(3.8)
        self.play(m.Indicate(q_node, color=SHARED),
                  m.Indicate(square_node, color=SQUARE),
                  m.Indicate(identity_node, color=IDENTITY), run_time=0.8)
        self.play(m.FadeOut(question), m.FadeOut(prompt), m.FadeOut(graph), run_time=0.8)

        # 00:18–00:32 — inspect each chain separately, then bring them together.
        title = text("Назад: вклад каждого пути", y=3.05, size=70)
        incoming = math(rf"\frac{{\partial L}}{{\partial p}}=p-{target}={gp}", y=0.7, size=100)
        meaning = text("Чувствительность ошибки к p", y=-1.3, size=60, color=MUTED)
        self.play(m.FadeIn(title), run_time=0.6)
        self.play(m.Write(incoming), m.FadeIn(meaning), run_time=0.8)
        self.wait(1.6)
        self.play(m.FadeOut(incoming), m.FadeOut(meaning), run_time=0.5)
        square_label = math(r"q^2:", x=-4.7, y=1.1, color=SQUARE)
        square_chain = math(rf"{gp}\times 2q=", x=-0.3, y=1.1, color=SQUARE)
        square_result = math(square, x=4.35, y=1.1, color=SQUARE)
        direct_label = math("q:", x=-4.7, y=-1.1, color=IDENTITY)
        direct_chain = math(rf"{gp}\times 1=", x=-0.3, y=-1.1, color=IDENTITY)
        direct_result = math(identity, x=4.35, y=-1.1, color=IDENTITY)
        self.play(m.FadeIn(square_label), run_time=0.5)
        self.play(m.Write(square_chain), m.FadeIn(square_result), run_time=0.8)
        self.wait(1.7)
        self.play(m.FadeIn(direct_label), run_time=0.5)
        self.play(m.Write(direct_chain), m.FadeIn(direct_result), run_time=0.8)
        self.wait(2.2)
        both = text("Оба вклада относятся к q", y=2.0, size=52, color=SHARED)
        self.play(m.FadeIn(both), run_time=0.8)
        self.wait(2.6)
        self.play(m.FadeOut(title), m.FadeOut(square_label), m.FadeOut(square_chain),
                  m.FadeOut(direct_label), m.FadeOut(direct_chain), m.FadeOut(both), run_time=0.6)

        # 00:32–00:44 — move both actual terms into the sum, then transfer.
        title = text("У общего узла — сложение", y=3.05, size=72)
        total = math(rf"\frac{{\partial L}}{{\partial q}}=", x=-3.8, y=1.25, size=100, color=SHARED)
        plus = math("+", x=0.5, y=1.25)
        equals = math(rf"={gq}", x=4.25, y=1.25, color=RESULT)
        self.play(m.FadeIn(title), run_time=0.6)
        self.play(square_result.animate.move_to([-1.1, 1.25, 0]),
                  direct_result.animate.move_to([1.9, 1.25, 0]),
                  m.FadeIn(total), m.FadeIn(plus), run_time=0.9)
        self.play(m.Write(equals), run_time=0.7)
        self.wait(2.8)
        dx = math(rf"\partial L/\partial x={gq}\,w={gx}", y=-0.25, size=74)
        dw = math(rf"\partial L/\partial w={gq}\,x={gw}", y=-1.35, size=74)
        self.play(m.FadeIn(dx), m.FadeIn(dw), run_time=0.8)
        self.wait(2.2)
        self.play(m.FadeOut(title), m.FadeOut(total), m.FadeOut(plus),
                  m.FadeOut(equals), m.FadeOut(square_result), m.FadeOut(direct_result),
                  m.FadeOut(dx), m.FadeOut(dw), run_time=0.6)
        invitation = text("Теперь измените x или w", y=1.5, size=78)
        prediction = text("Как изменятся два вклада?", y=-0.2, size=74, color=SHARED)
        destination = text("Проверьте в лаборатории ниже", y=-1.2, size=60, color=MUTED)
        self.play(m.FadeIn(invitation), m.FadeIn(prediction), m.FadeIn(destination), run_time=0.6)
        self.wait(2.8)
