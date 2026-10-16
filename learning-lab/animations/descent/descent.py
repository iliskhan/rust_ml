"""Two actual weights, exact optimizer steps; 50 seconds. Python only lays out fixture values."""
import json
from pathlib import Path
import manimgx as m

m.config.background_color = '#101622'
INK, MUTED, SGD, MOMENTUM, ADAM = '#F1F5F9', '#BBC8DB', '#75DFFF', '#F5C66A', '#BFADFF'


def text(words, x=0, y=0, size=66, color=INK):
    return m.Text(words, font='sans-serif', font_size=size, color=color).move_to([x, y, 0])


def math(words, x=0, y=0, size=76, color=INK):
    return m.MathTex(words, font_size=size, color=color).move_to([x, y, 0])


class GradientDescent(m.Scene):
    def construct(self):
        f = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf-8'))

        def point(p):
            return [-2.9 + .62 * p[0], .3 + .62 * p[1], 0]

        contours = m.VGroup(*(m.Line(point(a), point(b), color='#3E506A', stroke_width=2)
                              for contour in f['contours'] for a, b in zip(contour['points'], contour['points'][1:])))
        axes = m.VGroup(m.Line(point([-4.6, 0]), point([4.6, 0]), color=MUTED, stroke_width=2),
                        m.Line(point([0, -2]), point([0, 2]), color=MUTED, stroke_width=2),
                        text('Вес x', x=-2.9, y=-1.48, size=38, color=MUTED),
                        text('Вес y', x=-2.9, y=1.97, size=38, color=MUTED),
                        math('-4', x=-5.38, y=-1.17, size=34, color=MUTED),
                        math('4', x=-.42, y=-1.17, size=34, color=MUTED),
                        math('2', x=-6.25, y=1.54, size=34, color=MUTED),
                        math('-2', x=-6.25, y=-.94, size=34, color=MUTED))
        graph = m.VGroup(contours, axes)
        start = m.Dot(point(f['start']), radius=.12, color=INK)
        title = text('Как выбрать шаг?', y=3.05, size=68)
        formula = math(r'L=(x^2+8y^2)/2', x=3.6, y=1.6, size=66)
        initial = math(r'(x,y)=(-3,1.5)', x=3.6, y=.35, size=62)
        note = text('Эллипс: одна потеря L', x=3.6, y=-.8, size=38, color=MUTED)
        # 0–10: level sets and one shared start. No third weight is invented.
        self.play(m.FadeIn(title), run_time=.6)
        self.play(m.Create(graph), m.FadeIn(start), m.FadeIn(formula), run_time=1.4)
        self.play(m.FadeIn(initial), m.FadeIn(note), run_time=.6)
        self.wait(6.8)
        self.play(m.FadeOut(title), m.FadeOut(formula), m.FadeOut(initial), m.FadeOut(note), run_time=.6)
        # 10–18: a real prediction pause, answer appears only after 18.
        title = text('Куда сдвинется y?', y=3.05, size=68)
        question = m.VGroup(math(r'g=(-3,12)', x=3.6, y=1.6, size=72),
                            math(r'\eta=0.12', x=3.6, y=.4, size=72, color=SGD),
                            text('Сохранится ли знак?', x=3.6, y=-.8, size=40, color=MUTED))
        self.play(m.FadeIn(title), m.FadeIn(question), run_time=.8)
        self.wait(6.6)
        self.play(m.FadeOut(title), m.FadeOut(question), run_time=.6)
        # 18–28: a discrete step segment, then a numeric unstable comparison.
        title = text('Малый шаг и перелёт', y=3.05, size=68)
        next_p = f['tracks']['sgd'][1]['params']
        segment = m.Line(point(f['start']), point(next_p), color=SGD, stroke_width=7)
        answer = m.VGroup(math(r'y_1=1.5-0.12\cdot12', x=3.8, y=1.7, size=65),
                          math(r'y_1=0.06>0', x=3.8, y=.8, size=80, color=SGD),
                          text('При η = 0.30:', x=3.8, y=-.1, size=48, color=MOMENTUM),
                          math(r'1.50\to-2.10\to2.94', x=3.8, y=-1.1, size=62, color=MOMENTUM))
        self.play(m.FadeIn(title), m.FadeIn(answer), run_time=.8)
        self.play(m.Create(segment), start.animate.move_to(point(next_p)), run_time=1.2)
        self.wait(7.4)
        self.play(m.FadeOut(title), m.FadeOut(answer), m.FadeOut(segment), m.FadeOut(start), run_time=.6)
        # 28–42: each polyline joins exact iteration endpoints; common axes.
        title = text('Один старт, двадцать шагов', y=3.05, size=68)
        paths, labels = [], []
        for i, (kind, color, name) in enumerate([('sgd', SGD, 'SGD'), ('momentum', MOMENTUM, 'Momentum'), ('adam', ADAM, 'Adam')]):
            track = f['tracks'][kind]
            path = m.VGroup(*(m.Line(point(a['params']), point(b['params']), color=color, stroke_width=4)
                              for a, b in zip(track, track[1:])), m.Dot(point(track[-1]['params']), radius=.1, color=color))
            paths.append(path)
            labels.append(m.VGroup(text(name, x=3.8, y=1.8-i*1.15, size=55, color=color),
                                   text(f"L = {track[-1]['loss']:.3f}", x=3.8, y=1.3-i*1.15, size=42, color=color)))
        common = text('η = 0.12 · μ = 0.9 · β₁ = 0.9 · β₂ = 0.999', y=-1.5, x=2.9, size=31, color=MUTED)
        self.play(m.FadeIn(title), m.FadeIn(common), run_time=.6)
        for path, label in zip(paths, labels):
            self.play(m.Create(path), m.FadeIn(label), run_time=1.4)
            self.wait(1)
        self.wait(5.6)
        self.play(m.FadeOut(title), m.FadeOut(common), m.FadeOut(graph),
                  *(m.FadeOut(obj) for obj in paths+labels), run_time=.6)
        # 42–50: transfer changes the learning rate, not the shown numbers.
        invitation = m.VGroup(text('Проверьте другой шаг: η = 0.20', y=2.1, size=68),
                             text('Изменится ли знак y? А его модуль?', y=.6, size=62, color=SGD),
                             text('Сначала прогноз, затем один шаг в лаборатории', y=-.9, size=45, color=MUTED))
        self.play(m.FadeIn(invitation), run_time=.7)
        self.wait(7.3)
