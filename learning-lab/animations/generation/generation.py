"""A causal decoding step appends new K/V; all numbers come from the live lesson."""
import json
from pathlib import Path
import manimgx as m

m.config.background_color = "#101622"
INK, MUTED, Q, KV, RESULT = "#F1F5F9", "#BBC8DB", "#75DFFF", "#F5C66A", "#8CE6B0"


def text(words, x=0, y=0, size=60, color=INK):
    return m.Text(words, font="sans-serif", font_size=size, color=color).move_to([x, y, 0])


def math(words, x=0, y=0, size=76, color=INK):
    return m.MathTex(words, font_size=size, color=color).move_to([x, y, 0])


def vec(values):
    return "[" + r",\,".join(f"{v:.3f}" for v in values) + "]"


class CachedGeneration(m.Scene):
    def construct(self):
        f = json.loads(Path(__file__).with_name("fixture.json").read_text(encoding="utf-8"))
        before, after = f["steps"][2], f["steps"][3]
        assert after["keys"][:3] == before["keys"] and after["values"][:3] == before["values"]

        def row(position, y, state, color=KV):
            return m.VGroup(text(str(position), x=-4.9, y=y, size=51, color=color),
                            math(vec(state["keys"][position]), x=-1.8, y=y, size=64, color=color),
                            math(vec(state["values"][position]), x=3.3, y=y, size=64, color=color))

        # 0–8. Causal context grows one supplied token at a time.
        title = text("Генерация: сохранить K и V", y=3.05, size=68)
        tokens = m.VGroup(*(text(f"x{i}", x=x, y=1.6, size=83, color=Q)
                             for i, x in enumerate((-4.8, -1.6, 1.6))))
        new = text("x3", x=4.8, y=1.6, size=83, color=MUTED)
        note = m.VGroup(text("Обработаны позиции 0, 1, 2", y=0.2, size=59),
                        text("Следующий вход задан вручную", y=-1.2, size=49, color=MUTED))
        self.play(m.FadeIn(title), m.FadeIn(tokens), run_time=0.6)
        self.play(m.FadeIn(new), m.FadeIn(note), run_time=0.8)
        self.wait(6.0)
        self.play(m.FadeOut(title), m.FadeOut(tokens), m.FadeOut(new), m.FadeOut(note), run_time=0.6)

        # 8–18. Existing K already contain their absolute-position RoPE rotation.
        title = text("Кэш после трёх позиций", y=3.05, size=70)
        headers = m.VGroup(text("№", x=-4.9, y=2.05, size=43),
                           text("K после RoPE", x=-1.8, y=2.05, size=47, color=KV),
                           text("V", x=3.3, y=2.05, size=55, color=KV))
        old = m.VGroup(*(row(i, 1.05 - i * 0.9, before) for i in range(3)))
        self.play(m.FadeIn(title), m.FadeIn(headers), run_time=0.6)
        self.play(m.FadeIn(old), run_time=0.8)
        self.wait(8.0)
        self.play(m.FadeOut(title), m.FadeOut(headers), m.FadeOut(old), run_time=0.6)

        # 18–26. Predict before revealing whether the old rows are recomputed.
        title = text("Пришёл вход позиции 3", y=3.05, size=70)
        new_input = math(rf"x_3={vec(after['input'])}", y=1.65, size=95, color=Q)
        question = m.VGroup(text("Нужно заново считать старые K/V?", y=0.1, size=62),
                           text("Веса и прежние входы не менялись", y=-1.25, size=49, color=MUTED))
        self.play(m.FadeIn(title), m.FadeIn(new_input), m.FadeIn(question), run_time=0.6)
        self.wait(6.8)
        self.play(m.FadeOut(title), m.FadeOut(new_input), m.FadeOut(question), run_time=0.6)

        # 26–36. Persist the old rows while appending exactly one new row.
        title = text("Старые K/V сохраняем", y=3.05, size=70)
        headers = m.VGroup(text("№", x=-4.9, y=2.2, size=40),
                           text("K после RoPE", x=-1.8, y=2.2, size=44, color=KV),
                           text("V", x=3.3, y=2.2, size=52, color=KV))
        old = m.VGroup(*(row(i, 1.35 - i * 0.75, before) for i in range(3)))
        appended = row(3, -0.9, after, RESULT)
        self.play(m.FadeIn(title), m.FadeIn(headers), m.FadeIn(old), run_time=0.6)
        self.wait(1.4)
        self.play(m.FadeIn(appended), run_time=0.8)
        self.wait(4.6)
        self.play(m.FadeOut(title), run_time=0.4)
        title = text("Новые Q/K вращаем на позиции 3", y=3.05, size=61)
        self.play(m.FadeIn(title), run_time=0.4)
        self.wait(1.2)
        self.play(m.FadeOut(title), m.FadeOut(headers), m.FadeOut(old), m.FadeOut(appended), run_time=0.6)

        # 36–46. A single new query sees all four old/new keys and values.
        title = text("Ответ совпадает с полным расчётом", y=3.05, size=59)
        weights = math(rf"a_3\approx{vec(after['weights'])}", y=1.85, size=76, color=Q)
        cached = math(rf"o_{{cache}}\approx{vec(after['output'])}", y=0.55, size=86, color=RESULT)
        full = math(rf"o_{{full}}\approx{vec(after['fullOutput'])}", y=-0.75, size=86, color=RESULT)
        self.play(m.FadeIn(title), m.FadeIn(weights), run_time=0.6)
        self.play(m.FadeIn(cached), run_time=0.6)
        self.play(m.FadeIn(full), run_time=0.6)
        self.wait(7.6)
        self.play(m.FadeOut(title), m.FadeOut(weights), m.FadeOut(cached), m.FadeOut(full), run_time=0.6)

        # 46–50. Next prefix is supplied by the existing cache laboratory.
        final = m.VGroup(text("Добавьте пятую позицию", y=2.1, size=70),
                         text("Сравните кэш и полный расчёт", y=0.65, size=59, color=Q),
                         text("Что изменится, если исправить старый вход?", y=-0.9, size=45, color=MUTED))
        self.play(m.FadeIn(final), run_time=0.6)
        self.wait(3.4)
