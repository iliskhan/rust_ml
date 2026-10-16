"""One causal attention row, 50 seconds; numerical values come from TypeScript.

The three words label positions, not learned meanings. The lower band y < -1.8
is intentionally empty for the player captions and controls.
"""

import json
from pathlib import Path

import manimgx as m


m.config.background_color = "#101622"
INK = "#F1F5F9"
MUTED = "#BBC8DB"
QUERY = "#75DFFF"
KEY = "#F5C66A"
VALUE = "#BFADFF"
RESULT = "#8CE6B0"
MASK = "#FFB1AF"
COLS = (-4.4, 0, 4.4)


def text(words, x=0, y=0, size=64, color=INK):
    return m.Text(words, font="sans-serif", font_size=size, color=color).move_to([x, y, 0])


def math(expression, x=0, y=0, size=84, color=INK):
    return m.MathTex(expression, font_size=size, color=color).move_to([x, y, 0])


def number(value, digits=3):
    return f"{value:.{digits}f}".rstrip("0").rstrip(".")


def vector(values, digits=3):
    return r"[" + r",\,".join(number(value, digits) for value in values) + r"]"


class AttentionMixture(m.Scene):
    def construct(self):
        fixture = json.loads(Path(__file__).with_name("fixture.json").read_text(encoding="utf-8"))
        trace, query = fixture["trace"], fixture["queryIndex"]
        scores, weights = trace["scores"][query], trace["weights"][query]
        allowed = fixture["allowed"][query]
        # null is the serialized -Infinity sentinel, never a numeric zero.
        assert all((score is not None) == permit for score, permit in zip(scores, allowed))
        assert abs(sum(weights) - 1) < 1e-12
        assert all(permit or weight == 0 for permit, weight in zip(allowed, weights))
        q, k, v = trace["q"][query], trace["k"], trace["v"]

        def tokens(y=1.65):
            return m.VGroup(*(text(f"{j} · {word}", x=x, y=y, size=60,
                                  color=QUERY if j == query else INK)
                              for j, (x, word) in enumerate(zip(COLS, fixture["tokens"]))))

        # 00:00–00:08. Q chooses a row; K are compared; V are mixed.
        title = text("Attention: одна строка", y=3.05, size=76)
        positions = tokens(y=2.0)
        roles = m.VGroup(
            text("Q — запрос", x=COLS[0], y=0.95, size=52, color=QUERY),
            text("K — ключи", x=COLS[1], y=0.95, size=52, color=KEY),
            text("V — значения", x=COLS[2], y=0.95, size=52, color=VALUE),
            text("Выбираем q₁", x=COLS[0], y=0.15, size=42, color=MUTED),
            text("Сравниваем", x=COLS[1], y=0.15, size=42, color=MUTED),
            text("Смешиваем", x=COLS[2], y=0.15, size=42, color=MUTED),
            math(rf"q_1={vector(q)}", x=COLS[0], y=-0.8, size=76, color=QUERY),
            math(r"k_0,\ k_1,\ k_2", x=COLS[1], y=-0.8, size=76, color=KEY),
            math(r"v_0,\ v_1,\ v_2", x=COLS[2], y=-0.8, size=76, color=VALUE),
        )
        self.play(m.FadeIn(title), m.FadeIn(positions), run_time=0.6)
        self.play(m.FadeIn(roles), run_time=0.8)
        self.wait(6.0)
        self.play(m.FadeOut(title), m.FadeOut(positions), m.FadeOut(roles), run_time=0.6)

        # 00:08–00:18. Actual dot products, followed by the shared sqrt(d_k).
        title = text("Запрос q₁ и три ключа", y=3.05, size=72)
        query_label = math(rf"q_1={vector(q)},\quad d_k={len(q)}", y=2.1, size=72, color=QUERY)
        positions = tokens(y=1.15)
        keys = m.VGroup(*(math(rf"k_{j}={vector(key)}", x=x, y=0.15, size=72, color=KEY)
                          for j, (x, key) in enumerate(zip(COLS, k))))
        dots = m.VGroup(*(math(rf"q_1\cdot k_{j}={number(score)}", x=x, y=-0.95, size=70)
                          for j, (x, score) in enumerate(zip(COLS, trace["rawScores"][query]))))
        self.play(m.FadeIn(title), m.FadeIn(query_label), m.FadeIn(positions), run_time=0.6)
        self.play(m.FadeIn(keys), run_time=0.6)
        self.play(m.Write(dots), run_time=0.8)
        self.wait(2.0)
        self.play(m.FadeOut(keys), m.FadeOut(dots), run_time=0.4)
        division = math(r"s_j=(q_1\cdot k_j)/\sqrt{2}", y=2.1, size=76)
        scaled = m.VGroup(*(math(rf"\approx {number(score)}", x=x, y=-0.05, size=96)
                            for x, score in zip(COLS, trace["scaledScores"][query])))
        score_label = text("Score — ещё не вес", y=-1.25, size=56, color=MUTED)
        self.play(m.ReplacementTransform(query_label, division), m.FadeIn(scaled), m.FadeIn(score_label), run_time=0.7)
        self.wait(4.3)
        self.play(m.FadeOut(title), m.FadeOut(division), m.FadeOut(positions),
                  m.FadeOut(scaled), m.FadeOut(score_label), run_time=0.6)

        # 00:18–00:26. Pause, then explicitly forbid a larger future score.
        question = text("Будущий ключ получит вес?", y=3.05, size=72)
        prompt = text("Запрос: позиция 1 · Режим: causal", y=2.1, size=52, color=MUTED)
        positions = tokens(y=1.15)
        score_cells = [math(rf"\approx {number(score)}", x=x, y=0.0, size=96,
                            color=MASK if j > query else INK)
                       for j, (x, score) in enumerate(zip(COLS, trace["scaledScores"][query]))]
        future_label = text("Будущее", x=COLS[2], y=-1.1, size=48, color=MASK)
        self.play(m.FadeIn(question), m.FadeIn(prompt), m.FadeIn(positions),
                  *(m.FadeIn(cell) for cell in score_cells), m.FadeIn(future_label), run_time=0.6)
        self.wait(3.4)
        self.play(m.FadeOut(question), m.FadeOut(future_label), run_time=0.4)
        answer = text("Маска запрещает будущее", y=3.05, size=74)
        forbidden = math(r"-\infty", x=COLS[2], y=0.0, size=104, color=MASK)
        rule = math(r"j>1\quad\Rightarrow\quad s_j=-\infty", y=-1.15, size=78, color=MASK)
        self.play(m.FadeIn(answer), m.ReplacementTransform(score_cells[2], forbidden),
                  m.FadeIn(rule), run_time=0.6)
        self.wait(2.4)
        self.play(m.FadeOut(answer), m.FadeOut(prompt), m.FadeOut(positions),
                  m.FadeOut(score_cells[0]), m.FadeOut(score_cells[1]),
                  m.FadeOut(forbidden), m.FadeOut(rule), run_time=0.6)

        # 00:26–00:35. Normalize the allowed scores; forbidden is exactly zero.
        title = text("Softmax: от scores к весам", y=3.05, size=68)
        formula = math(r"a_j=\exp(s_j)/\sum_l\exp(s_l),\quad T=1", y=1.85, size=70)
        positions = tokens(y=0.7)
        weight_cells = m.VGroup(*(math(rf"a_{j}" + (r"\approx" if permit else "=") + number(weight), x=x, y=-0.3, size=82,
                                     color=RESULT if permit else MASK)
                                 for j, (x, weight, permit) in enumerate(zip(COLS, weights, allowed))))
        total = math(rf"{number(weights[0])}+{number(weights[1])}+0=1", y=-1.35, size=72, color=RESULT)
        self.play(m.FadeIn(title), m.FadeIn(formula), run_time=0.6)
        self.play(m.FadeIn(positions), m.FadeIn(weight_cells), run_time=0.8)
        self.wait(2.0)
        self.play(m.Write(total), run_time=0.8)
        self.wait(4.2)
        self.play(m.FadeOut(title), m.FadeOut(formula), m.FadeOut(positions),
                  m.FadeOut(weight_cells), m.FadeOut(total), run_time=0.6)

        # 00:35–00:46. Each weight multiplies V, then both coordinates sum.
        title = text("Смешиваем значения V", y=3.05, size=76)
        positions = tokens(y=2.05)
        values = m.VGroup(*(math(rf"v_{j}={vector(value)}", x=x, y=1.05, size=74, color=VALUE)
                            for j, (x, value) in enumerate(zip(COLS, v))))
        terms = m.VGroup(*(math(rf"{number(weight)}\times {vector(value)}", x=x, y=-0.05,
                               size=66, color=VALUE if permit else MASK)
                           for x, weight, value, permit in zip(COLS, weights, v, allowed)))
        self.play(m.FadeIn(title), m.FadeIn(positions), m.FadeIn(values), run_time=0.6)
        self.play(m.FadeIn(terms), run_time=0.8)
        self.wait(2.0)
        result = math(rf"o_1\approx {vector(trace['output'][query])}",
                      y=-1.25, size=78, color=RESULT)
        self.play(m.Write(result), run_time=0.8)
        self.wait(3.2)
        self.play(m.FadeOut(positions), m.FadeOut(values), m.FadeOut(terms), m.FadeOut(result), run_time=0.6)
        first = math(rf"o_{{1,0}}=a_0\cdot1+a_1\cdot0.5\approx{number(trace['output'][query][0])}",
                     y=1.1, size=80, color=RESULT)
        second = math(rf"o_{{1,1}}=a_0\cdot0+a_1\cdot1\approx{number(trace['output'][query][1])}",
                      y=-0.3, size=80, color=RESULT)
        self.play(m.FadeIn(first), m.FadeIn(second), run_time=0.6)
        self.wait(1.8)
        self.play(m.FadeOut(title), m.FadeOut(first), m.FadeOut(second), run_time=0.6)

        # 00:46–00:50. A new prediction, with an exact return to the lab.
        invitation = text("Отключите causal-маску", y=2.0, size=72)
        prediction = text("У «рыбу» появится вес. А выход?", y=0.6, size=68, color=QUERY)
        destination = text("Предскажите и проверьте в лаборатории", y=-0.8, size=54, color=MUTED)
        self.play(m.FadeIn(invitation), m.FadeIn(prediction), m.FadeIn(destination), run_time=0.6)
        self.wait(3.4)
