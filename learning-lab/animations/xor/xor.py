"""XOR points, actual hidden contributions and sampled probability fields; 50 seconds."""
import json
from pathlib import Path
import manimgx as m

m.config.background_color = '#101622'
INK, MUTED, ZERO, ONE = '#F1F5F9', '#BBC8DB', '#75DFFF', '#F5C66A'
HIDDEN = ['#75DFFF', '#F5C66A', '#BFADFF', '#8CE6B0']


def text(words, x=0, y=0, size=66, color=INK):
    return m.Text(words, font='sans-serif', font_size=size, color=color).move_to([x, y, 0])


def math(words, x=0, y=0, size=76, color=INK):
    return m.MathTex(words, font_size=size, color=color).move_to([x, y, 0])


class XORNetwork(m.Scene):
    def construct(self):
        f = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf-8'))

        def plot(center, size, grid=None):
            cx, cy = center
            def point(p):
                return [cx + (p[0]-.5)*size, cy + (p[1]-.5)*size, 0]
            parts = []
            if grid:
                for row in grid:
                    for cell in row:
                        p = cell['probability']
                        # Probability samples have one shared colour scale in both panels.
                        color = '#F5C66A' if p >= .5 else '#75DFFF'
                        parts.append(m.Rectangle(width=size/14+.005, height=size/14+.005,
                                                 stroke_width=0, fill_color=color,
                                                 fill_opacity=.1+.65*abs(2*p-1)).move_to(point(cell['input'])))
            # Axis guides sit outside the sampled square and corner target labels.
            parts.extend([m.Line(point([0, -.18]), point([1, -.18]), color=MUTED, stroke_width=2),
                          m.Line(point([-.18, 0]), point([-.18, 1]), color=MUTED, stroke_width=2),
                          text('x₁: 0…1', x=cx, y=cy-size/2-.8, size=31, color=MUTED),
                          text('x₂: 0…1', x=cx-size/2-.9, y=cy, size=31, color=MUTED).rotate(m.PI/2)])
            for sample in f['data']:
                pos = point(sample['input'])
                color = ONE if sample['target'] else ZERO
                parts.append(m.Dot(pos, radius=.34, color='#101622'))
                parts.append(math(str(sample['target']), x=pos[0], y=pos[1], size=44, color=color))
            return m.VGroup(*parts)

        # 0–10: the targets occupy opposite corners; axes are actual inputs.
        title = text('Как устроен XOR?', y=3.05, size=68)
        points = plot((-2.9, .7), 2.5)
        rule = m.VGroup(math(r'0\oplus0=0', x=3.3, y=1.8, size=78, color=ZERO),
                        math(r'0\oplus1=1', x=3.3, y=.7, size=78, color=ONE),
                        text('Разные входы → 1', x=3.3, y=-.6, size=43, color=MUTED))
        self.play(m.FadeIn(title), run_time=.6)
        self.play(m.FadeIn(points), m.FadeIn(rule), run_time=1)
        self.wait(7.8)
        self.play(m.FadeOut(title), m.FadeOut(rule), run_time=.6)
        # 10–18: no separating curve or trained predictions shown yet.
        title = text('Хватит ли одной прямой?', y=3.05, size=72)
        question = m.VGroup(text('Нули — по диагонали', x=3.2, y=1.4, size=45, color=ZERO),
                            text('Единицы — по другой', x=3.2, y=.3, size=45, color=ONE),
                            text('Сначала свой прогноз', x=3.2, y=-.9, size=40, color=MUTED))
        self.play(m.FadeIn(title), m.FadeIn(question), run_time=.8)
        self.wait(6.6)
        self.play(m.FadeOut(title), m.FadeOut(question), m.FadeOut(points), run_time=.6)
        # 18–28: the real four tanh outputs contribute to one logit.
        title = text('Одна прямая не разделит XOR', y=3.05, size=62)
        subtitle = text('Четыре нелинейных признака', y=2.13, size=45, color=MUTED)
        sample_label = math(r'x=(0,1)', x=-4.9, y=.5, size=73)
        contributions = []
        for i, h in enumerate(f['trace']['hidden']):
            y = 1.4-i*.64
            contributions.append(m.VGroup(
                math(rf'h_{i+1}={h["activation"]:.2f}', x=-1.6, y=y, size=53, color=HIDDEN[i]),
                math(rf'w_{i+1}h_{i+1}={f["trace"]["outputContributions"][i]:+.2f}', x=2, y=y, size=53, color=HIDDEN[i])))
        output = m.VGroup(math(rf'z={f["trace"]["logit"]:.2f}', x=5.3, y=.7, size=67),
                          math(rf'p={f["trace"]["probability"]:.3f}', x=5.3, y=-.25, size=67, color=ONE))
        note = text(f'Сумма + смещение {f["final"]["params"][16]:+.2f} → sigmoid', y=-1.5, size=38, color=MUTED)
        self.play(m.FadeIn(title), m.FadeIn(subtitle), m.FadeIn(sample_label), run_time=.8)
        for row in contributions:
            self.play(m.FadeIn(row), run_time=.4)
        self.play(m.FadeIn(output), m.FadeIn(note), run_time=.6)
        self.wait(6.4)
        self.play(m.FadeOut(title), m.FadeOut(subtitle), m.FadeOut(sample_label), m.FadeOut(output), m.FadeOut(note),
                  *(m.FadeOut(row) for row in contributions), run_time=.6)
        # 28–42: common coordinates and probability scale; training set only.
        title = text('Тысяча шагов Adam', y=3.05, size=68)
        before, after = plot((-3.5, .6), 2.2, f['initial']['grid']), plot((3.5, .6), 2.2, f['final']['grid'])
        labels = m.VGroup(text(f'До: BCE {f["initial"]["loss"]:.3f}', x=-3.5, y=2.4, size=42),
                          text(f'После: BCE {f["final"]["loss"]:.3f}', x=3.5, y=2.4, size=42),
                          text('seed 42 · η=.03', y=-1.4, size=27, color=MUTED))
        legend = m.VGroup(text('p < 0.5', y=.95, size=38, color=ZERO),
                          text('p ≥ 0.5', y=.15, size=38, color=ONE),
                          text('Фон — p', y=-.65, size=32, color=MUTED))
        self.play(m.FadeIn(title), m.FadeIn(before), m.FadeIn(labels), m.FadeIn(legend), run_time=.8)
        self.play(m.FadeIn(after), run_time=1.2)
        self.wait(11.4)
        self.play(m.FadeOut(title), m.FadeOut(before), m.FadeOut(after), m.FadeOut(labels), m.FadeOut(legend), run_time=.6)
        # 42–50: novel local derivative question is answered outside the film.
        invitation = m.VGroup(text('Цель 0, прогноз 0.8', y=2.1, size=67),
                             text('Куда менять число до sigmoid?', y=.6, size=58, color=ONE),
                             text('Проверьте в лаборатории', y=-.9, size=46, color=MUTED))
        self.play(m.FadeIn(invitation), run_time=.7)
        self.wait(7.3)
