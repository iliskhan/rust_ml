"""Four independent query heads, concatenation, output projection, and shared KV."""
import json
from pathlib import Path
import manimgx as m

m.config.background_color = "#101622"
INK, MUTED, Q, KV, RESULT = "#F1F5F9", "#BBC8DB", "#75DFFF", "#F5C66A", "#8CE6B0"
COLS = (-4.8, -1.6, 1.6, 4.8)


def text(words, x=0, y=0, size=60, color=INK):
    return m.Text(words, font="sans-serif", font_size=size, color=color).move_to([x, y, 0])


def math(words, x=0, y=0, size=76, color=INK):
    return m.MathTex(words, font_size=size, color=color).move_to([x, y, 0])


def vec(values, digits=3):
    return "[" + r",\,".join(f"{v:.{digits}f}" for v in values) + "]"


class AttentionHeads(m.Scene):
    def construct(self):
        f = json.loads(Path(__file__).with_name("fixture.json").read_text(encoding="utf-8"))
        mha, gqa, mqa = f["modes"]

        def queries(y=1.7):
            return m.VGroup(*(text(f"Q{i + 1}", x=x, y=y, size=67, color=Q) for i, x in enumerate(COLS)))

        def routes(mode):
            count = mode["kvHeads"]
            centers = COLS if count == 4 else (-3.2, 3.2) if count == 2 else (0,)
            return m.VGroup(
                *(m.Arrow([x, 1.15, 0], [centers[group], 0.15, 0], buff=0.08,
                          color=KV, stroke_width=5) for x, group in zip(COLS, mode["groups"])),
                *(text(f"K/V {i + 1}", x=x, y=-0.3, size=57, color=KV) for i, x in enumerate(centers)))

        # 0–8. One chosen token, four query heads, two output coordinates each.
        title = text("Четыре головы внимания", y=3.05, size=72)
        chosen = text("Одна позиция 2 · causal attention", y=2.15, size=48, color=MUTED)
        q = queries(y=1.1)
        outputs = m.VGroup(*(math(vec(value, 2), x=x, y=0.0, size=48, color=RESULT)
                              for x, value in zip(COLS, mha["headOutputs"])))
        caption = text("У каждой головы — свой ответ из 2 чисел", y=-1.25, size=50)
        self.play(m.FadeIn(title), m.FadeIn(chosen), m.FadeIn(q), run_time=0.6)
        self.play(m.FadeIn(outputs), m.FadeIn(caption), run_time=0.8)
        self.wait(6.0)
        self.play(m.FadeOut(title), m.FadeOut(chosen), m.FadeOut(caption), run_time=0.6)

        # 8–18. Concatenation preserves the eight numbers and their head order.
        title = text("Склеиваем ответы: 4 × 2 = 8", y=3.05, size=65)
        caption = text("Concat сохраняет порядок голов", y=-1.25, size=53, color=MUTED)
        self.play(m.FadeIn(title), m.FadeIn(caption), run_time=0.6)
        boxes = m.VGroup(*(m.Rectangle(width=2.95, height=1.1, color=RESULT, stroke_width=3)
                            .move_to([x, 0.0, 0]) for x in COLS))
        self.play(m.Create(boxes), run_time=0.8)
        self.wait(5.4)
        dimensions = math(r"[o_1\mid o_2\mid o_3\mid o_4]\in\mathbb{R}^{8}", y=-1.2, size=82)
        self.play(m.ReplacementTransform(caption, dimensions), run_time=0.6)
        self.wait(2.0)
        self.play(m.FadeOut(title), m.FadeOut(q), m.FadeOut(outputs), m.FadeOut(boxes), m.FadeOut(dimensions), run_time=0.6)

        # 18–26. Actual fixed W^O maps eight concatenated values back to four.
        title = text("Проекция возвращает ширину 4", y=3.05, size=64)
        shape = math(r"(1\times8)\;W^O_{8\times4}\;\longrightarrow\;(1\times4)", y=1.65, size=83)
        output = math(rf"o\approx {vec(mha['output'])}", y=0.1, size=81, color=RESULT)
        note = text("Это проекция, а не усреднение всех голов", y=-1.25, size=47, color=MUTED)
        self.play(m.FadeIn(title), m.FadeIn(shape), run_time=0.6)
        self.play(m.Write(output), m.FadeIn(note), run_time=0.8)
        self.wait(6.0)
        self.play(m.FadeOut(title), m.FadeOut(shape), m.FadeOut(output), m.FadeOut(note), run_time=0.6)

        # 26–36. Question first; sharing only changes KV routing after 32 seconds.
        title = text("Общие K/V: сколько запросов?", y=3.05, size=64)
        q, links = queries(), routes(mha)
        question = text("MHA → GQA: 4 группы станут 2", y=-1.3, size=50, color=MUTED)
        self.play(m.FadeIn(title), m.FadeIn(q), m.FadeIn(links), m.FadeIn(question), run_time=0.6)
        self.wait(5.0)
        self.play(m.FadeOut(title), m.FadeOut(links), m.FadeOut(question), run_time=0.4)
        title = text("GQA: 4 запроса · 2 группы K/V", y=3.05, size=64)
        links = routes(gqa)
        note = text("Q1 и Q2 делят K/V, но имеют свои веса", y=-1.35, size=47, color=MUTED)
        self.play(m.FadeIn(title), m.FadeIn(links), m.FadeIn(note), run_time=0.6)
        self.wait(2.8)
        self.play(m.FadeOut(title), m.FadeOut(links), m.FadeOut(note), run_time=0.6)

        # 36–46. MQA preserves Q heads; display unequal GQA attention weights too.
        title = text("MQA: 4 запроса · 1 группа K/V", y=3.05, size=64)
        links = routes(mqa)
        note = text("Меньше K/V в кэше · по-прежнему 4 ответа", y=-1.35, size=46, color=MUTED)
        self.play(m.FadeIn(title), m.FadeIn(links), m.FadeIn(note), run_time=0.6)
        self.wait(3.4)
        self.play(m.FadeOut(title), m.FadeOut(q), m.FadeOut(links), m.FadeOut(note), run_time=0.6)
        title = text("Общие K/V не уравнивают веса", y=3.05, size=64)
        weights = m.VGroup(text("GQA · запрос позиции 2", y=2.05, size=47, color=MUTED),
                           math(rf"a_1\approx{vec(gqa['weights'][0])}", y=0.9, size=81, color=Q),
                           math(rf"a_2\approx{vec(gqa['weights'][1])}", y=-0.65, size=81, color=KV))
        self.play(m.FadeIn(title), m.FadeIn(weights), run_time=0.6)
        self.wait(4.2)
        self.play(m.FadeOut(title), m.FadeOut(weights), run_time=0.6)

        # 46–50. An actual parameter change in the existing heads laboratory.
        final = m.VGroup(text("Выберите GQA в лаборатории", y=2.1, size=66),
                         text("Сравните головы 1 и 2", y=0.65, size=65, color=Q),
                         text("Какие числа общие, а какие различаются?", y=-0.9, size=47, color=MUTED))
        self.play(m.FadeIn(final), run_time=0.6)
        self.wait(3.4)
