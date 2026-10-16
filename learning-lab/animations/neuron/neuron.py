"""Fixture-driven visual prototype: weighted pulses, signed sum, ReLU.

The same mechanism stays on screen for 44 seconds. No narrated slides.
Georgia labels are deliberately small; numerical geometry carries the story.
"""
import json
from pathlib import Path
import manimgx as m

m.config.background_color = "#090E15"
INK, MUTED = "#E9E7E1", "#82909F"
FIRST, SECOND, BIAS, RESULT = "#75DFFF", "#F5C66A", "#BFADFF", "#8CE6B0"
CHAPTERS = (0, 10, 18, 26, 38)
QUESTION_TIME, REVEAL_TIME, DURATION = 22, 23.4, 44


def label(words, x, y, size=30, color=INK):
    return m.Text(str(words), font="Georgia", font_size=size, color=color).move_to([x, y, 0])


def number(value, x, y, size=42, color=INK):
    return m.MathTex(f"{value:g}", font_size=size, color=color).move_to([x, y, 0])


class NeuronActivation(m.Scene):
    def construct(self):
        fixture = json.loads(Path(__file__).with_name("fixture.json").read_text(encoding="utf-8"))
        first, last = fixture["initial"], fixture["final"]
        inputs, weights, contributions = fixture["inputs"], fixture["weights"], fixture["contributions"]
        kink = next(point for point in fixture["curve"] if point["z"] == 0)
        assert first["z"] < 0 < last["z"]
        assert kink["output"] == 0
        elapsed = 0.0

        def play(*animations, seconds=.6):
            nonlocal elapsed
            self.play(*animations, run_time=seconds)
            elapsed += seconds

        def until(instant):
            nonlocal elapsed
            assert elapsed <= instant + 1e-8, (elapsed, instant)
            if instant > elapsed:
                self.wait(instant - elapsed)
                elapsed = instant

        # Network positions encode connectivity only. Node values are scalars.
        input_points = [(-5.4, 2.25), (-5.4, .95)]
        sum_point = (-2.05, 1.6)
        nodes = m.VGroup(*(m.Circle(radius=.43, color=color, fill_opacity=.09, stroke_width=2)
                             .move_to([*position, 0])
                           for position, color in zip(input_points, (FIRST, SECOND))))
        input_values = m.VGroup(*(number(v, *p, color=color)
                                 for v, p, color in zip(inputs, input_points, (FIRST, SECOND))))
        input_names = m.VGroup(*(label("x" + sub, p[0]-.75, p[1], color=color)
                                for sub, p, color in zip(("₁", "₂"), input_points, (FIRST, SECOND))))
        soma = m.Circle(radius=.46, color=INK, fill_opacity=.04, stroke_width=2).move_to([*sum_point, 0])
        sigma = m.MathTex(r"\Sigma", font_size=43, color=INK).move_to([*sum_point, 0])
        edges = m.VGroup(*(m.Line([p[0]+.43, p[1], 0], [sum_point[0]-.46, sum_point[1], 0],
                                  color=color, stroke_width=max(1, 5*abs(w)))
                          for p, w, color in zip(input_points, weights, (FIRST, SECOND))))
        weight_labels = m.VGroup(*(label("×" + f"{w:g}".replace("-", "−"),
                                         -3.75, 2.35 if i == 0 else .95, size=30, color=color)
                                  for i, (w, color) in enumerate(zip(weights, (FIRST, SECOND)))))
        bias_node = m.Circle(radius=.27, color=BIAS, fill_opacity=.09, stroke_width=2).move_to([-2.05, 2.95, 0])
        bias_value = number(first["bias"], -2.05, 2.95, size=31, color=BIAS)
        bias_name = label("b", -1.55, 2.95, color=BIAS)
        bias_edge = m.Line([-2.05, 2.68, 0], [-2.05, 2.06, 0], color=BIAS, stroke_width=3)
        play(m.Create(edges), m.Create(nodes), m.FadeIn(input_values), m.FadeIn(input_names),
             m.Create(soma), m.FadeIn(sigma), m.FadeIn(weight_labels), seconds=1.2)

        # Each separate pulse physically travels along its own weighted edge.
        products = []
        for i, (p, color, contribution) in enumerate(zip(input_points, (FIRST, SECOND), contributions)):
            until(2.0 if i == 0 else 5.3)
            pulse = m.Dot([p[0]+.43, p[1], 0], radius=.09, color=color)
            self.add(pulse)
            play(pulse.animate.move_to([sum_point[0]-.46, sum_point[1], 0]), seconds=1.7)
            product = number(contribution, -2.85, 2.3 if i == 0 else .85, size=37, color=color)
            products.append(product)
            play(m.FadeOut(pulse), m.FadeIn(product), seconds=.45)
        until(10)

        # Signed contributions move on a genuine one-dimensional number scale.
        # Display transform only: z=-2..3 maps to the horizontal positions below.
        def tape(z, y=-.95):
            return [-3.4 + .9*z, y, 0]

        tape_axis = m.Arrow(tape(-2.5), tape(3.4), color=MUTED, buff=0, stroke_width=1.8)
        ticks = m.VGroup(*(m.Line(tape(v, -1.02), tape(v, -.88), color=MUTED, stroke_width=1.8)
                           for v in (-2, -1, 0, 1, 2, 3)))
        tick_labels = m.VGroup(*(number(v, tape(v)[0], -1.3, size=24, color=MUTED)
                                 for v in (-2, -1, 0, 1, 2, 3)))
        tape_name = label("z", -.05, -.94, size=29, color=MUTED)
        play(m.Create(tape_axis), m.Create(ticks), m.FadeIn(tick_labels), m.FadeIn(tape_name),
             m.Create(bias_node), m.FadeIn(bias_value), m.FadeIn(bias_name), m.Create(bias_edge), seconds=.75)
        sum_marker = m.Dot(tape(0), radius=.085, color=INK)
        self.add(sum_marker)
        cumulative = 0
        segments = []
        for i, (contribution, color, y) in enumerate(zip(contributions, (FIRST, SECOND), (.12, -.25))):
            end = cumulative + contribution
            segment = m.Arrow(tape(cumulative, y), tape(end, y), buff=0, color=color, stroke_width=7)
            stem = m.Line(tape(end, y), tape(end), color=color, stroke_width=1.3)
            magnitude = products[i].copy()
            self.add(magnitude)
            magnitude_position = tape((cumulative+end)/2, y+.28) if i == 0 else tape(end-.55, y)
            play(magnitude.animate.move_to(magnitude_position), seconds=.45)
            play(m.Create(segment), sum_marker.animate.move_to(tape(end)), seconds=1.3)
            play(m.Create(stem), seconds=.25)
            segments.append(segment)
            cumulative = end
        # The zero-length initial bias is a dot, not an invented positive bar.
        bias_start = first["z"] - first["bias"]
        if first["bias"] == 0:
            bias_segment = m.Dot(tape(bias_start, -.59), radius=.055, color=BIAS)
        else:
            bias_segment = m.Line(tape(bias_start, -.59), tape(first["z"], -.59), color=BIAS, stroke_width=8)
        play(m.FadeIn(bias_segment), sum_marker.animate.move_to(tape(first["z"])), seconds=.65)
        sum_value = number(first["z"], *sum_point, size=45, color=INK)
        play(m.FadeOut(sigma), m.FadeIn(sum_value), seconds=.4)
        until(18)

        # Actual ReLU axes: horizontal preactivation z, vertical activation a.
        def graph(z, a):
            return [3.15 + 1.02*z, .05 + 1.05*a, 0]

        axes = m.VGroup(
            m.Arrow(graph(-2.2, 0), graph(2.45, 0), buff=0, color=MUTED, stroke_width=1.8),
            m.Arrow(graph(0, -.12), graph(0, 2.3), buff=0, color=MUTED, stroke_width=1.8),
            label("z", 5.9, .05, size=27, color=MUTED),
            label("a", 3.15, 2.65, size=27, color=MUTED),
            number(0, 2.92, -.23, size=23, color=MUTED),
            number(-1, 2.13, -.23, size=23, color=MUTED),
            number(1, 4.17, -.23, size=23, color=MUTED),
            number(1, 2.91, 1.10, size=23, color=MUTED),
        )
        curve = m.VGroup(*(m.Line(graph(left["z"], left["output"]),
                                 graph(right["z"], right["output"]), color=RESULT, stroke_width=5)
                             for left, right in zip(fixture["curve"], fixture["curve"][1:])))
        relu = m.MathTex(r"a=\max(0,z)", font_size=44, color=RESULT).move_to([3.6, 3.05, 0])
        unknown = label("?", 5.8, 2.55, size=42, color=INK)
        play(m.Create(axes), m.Create(curve), m.FadeIn(relu), seconds=.9)
        play(m.FadeIn(unknown), seconds=.4)
        until(QUESTION_TIME)
        until(REVEAL_TIME)

        # The value leaves the sum and lands on its corresponding ReLU point.
        route = m.Line([sum_point[0]+.46, sum_point[1], 0], graph(first["z"], first["output"]),
                       color=MUTED, stroke_width=1.4)
        pulse = m.Dot([sum_point[0]+.46, sum_point[1], 0], radius=.08, color=INK)
        play(m.Create(route), m.FadeOut(unknown), seconds=.2)
        self.add(pulse)
        play(pulse.animate.move_to(graph(first["z"], first["output"])), seconds=.6)
        marker = m.Dot(graph(first["z"], first["output"]), radius=.11, color=RESULT)
        zero_output = number(first["output"], graph(first["z"], first["output"])[0]-.2, .45, size=38, color=RESULT)
        play(m.FadeOut(pulse), m.FadeIn(marker), m.FadeIn(zero_output), seconds=.3)
        until(26)

        # b changes, inputs and edges stay. Both numerical markers move together.
        highlight = m.Circle(radius=.36, color=BIAS, stroke_width=2).move_to([-2.05, 2.95, 0])
        play(m.Create(highlight), seconds=.55)
        until(28)
        play(m.FadeOut(sum_value), m.FadeOut(bias_value), m.FadeOut(zero_output), m.FadeOut(route), seconds=.2)
        self.remove(bias_segment)
        to_zero = m.Line(tape(bias_start, -.59), tape(kink["z"], -.59), color=BIAS, stroke_width=8)
        play(m.Create(to_zero),
             sum_marker.animate.move_to(tape(kink["z"])),
             marker.animate.move_to(graph(kink["z"], kink["output"])), seconds=1.8)
        crossing_bias = first["bias"] - first["z"]
        middle_bias = number(crossing_bias, -2.05, 2.95, size=31, color=BIAS)
        middle_sum = number(kink["z"], *sum_point, size=45)
        play(m.FadeIn(middle_bias), m.FadeIn(middle_sum), seconds=.25)
        until(31)
        play(m.FadeOut(middle_bias), m.FadeOut(middle_sum), seconds=.2)
        full_bias = m.Line(tape(bias_start, -.59), tape(last["z"], -.59), color=BIAS, stroke_width=8)
        play(m.Transform(to_zero, full_bias),
             sum_marker.animate.move_to(tape(last["z"])),
             marker.animate.move_to(graph(last["z"], last["output"])), seconds=1.8)
        final_bias = number(last["bias"], -2.05, 2.95, size=31, color=BIAS)
        final_sum = number(last["z"], *sum_point, size=45)
        final_output = number(last["output"], graph(last["z"], last["output"])[0]+.65, graph(last["z"], last["output"])[1], size=38, color=RESULT)
        guides = m.VGroup(
            m.Line(graph(last["z"], 0), graph(last["z"], last["output"]), color=BIAS, stroke_width=1.5),
            m.Line(graph(0, last["output"]), graph(last["z"], last["output"]), color=BIAS, stroke_width=1.5))
        play(m.FadeIn(final_bias), m.FadeIn(final_sum), m.FadeIn(final_output), m.Create(guides), seconds=.5)
        until(38)

        # Handoff keeps the mechanism in view, highlighting just the editable b.
        invitation = label("ваш b", -3.25, 3.0, size=30, color=BIAS)
        play(m.FadeIn(invitation), m.FadeOut(highlight), seconds=.5)
        ring = m.Circle(radius=.36, color=BIAS, stroke_width=2).move_to([-2.05, 2.95, 0])
        play(m.Create(ring), seconds=.7)
        until(DURATION)
        assert abs(elapsed-DURATION)<1e-8
