"""Silent geometric attention. Vectors and probabilities come from the actual lab."""
import json
from pathlib import Path
import manimgx as m

m.config.background_color = '#0B0E14'
INK, MUTED = '#F0ECE2', '#89929F'
CYAN, GOLD, PURPLE, GREEN, RED = '#72D8EE', '#F2C66D', '#B3A0E0', '#8FD6A3', '#D88B90'


def label(words, x=0, y=0, size=34, color=INK):
    return m.Text(words, font='Georgia', font_size=size, color=color).move_to([x, y, 0])


def equation(words, x=0, y=0, size=55, color=INK):
    return m.MathTex(words, font_size=size, color=color).move_to([x, y, 0])


def arrow(a, b, color=INK, width=4):
    return m.Arrow(a, b, buff=0, color=color, stroke_width=width)


class AttentionMixture(m.Scene):
    def construct(self):
        f = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf-8'))
        trace, row = f['trace'], f['queryIndex']
        q, keys, values = trace['q'][row], trace['k'], trace['v']
        scores, weights, result = trace['scaledScores'][row], trace['weights'][row], trace['output'][row]
        assert q == [0, 1]  # Projection onto the actual vertical query below.
        assert weights[2] == 0 and abs(sum(weights)-1) < 1e-12
        elapsed = 0

        def play(*animations, seconds=.7):
            nonlocal elapsed
            self.play(*animations, run_time=seconds)
            elapsed += seconds

        def until(time):
            nonlocal elapsed
            if elapsed < time:
                self.wait(time-elapsed)
                elapsed = time

        tokens = m.VGroup(*(label(word, x, 3.0, 43) for x, word in zip([-4.3, 0, 4.3], f['tokens'])))
        selection = m.Line([-.65, 2.58, 0], [.65, 2.58, 0], color=CYAN, stroke_width=5)
        origin, scale = [-4.2, -.7, 0], 1.75

        def point(v):
            return [origin[0]+scale*v[0], origin[1]+scale*v[1], 0]

        axes = m.VGroup(
            arrow(point([-.15, 0]), point([1.55, 0]), MUTED, 2),
            arrow(point([0, -.15]), point([0, 1.8]), MUTED, 2),
            equation('0', -4.42, -.98, 30, MUTED), equation('1', -2.45, -1, 30, MUTED),
            equation('1', -4.48, 1.05, 30, MUTED), equation('k_0', -1.23, -.7, 34, MUTED),
            equation('k_1', -4.62, 2.45, 34, MUTED))
        query = arrow(point([0, 0]), point(q), CYAN, 7)
        query_name = equation('q', -4.65, 1.1, 46, CYAN)
        key_arrows = [arrow(point([0, 0]), point(k), GOLD, 4) for k in keys]
        key_names = [equation(f'K_{j}', point(k)[0]+.35, point(k)[1]+.15, 36, GOLD)
                     for j, k in enumerate(keys)]
        score_x, baseline, bar_scale = [1.2, 3.25, 5.3], -.7, 2.1
        bar_axis = m.Line([.4, baseline, 0], [6.1, baseline, 0], color=MUTED, stroke_width=2)
        score_title = equation(r's_j=q\cdot K_j/\sqrt{2}', 3.3, 2.1, 45)
        bar_names = m.VGroup(*(label(word, x, -1.16, 31, MUTED) for x, word in zip(score_x, f['tokens'])))
        bars = [m.Rectangle(width=.66, height=.012, color=GOLD, fill_color=GOLD, fill_opacity=.65,
                            stroke_width=0).move_to([x, baseline+.006, 0]) for x in score_x]
        # 0–8: one query and three keys in their actual two dimensional space.
        play(m.FadeIn(tokens), m.Create(selection))
        play(m.Create(axes), m.Create(query), m.FadeIn(query_name), seconds=1.1)
        for vector, name in zip(key_arrows, key_names):
            play(m.Create(vector), m.FadeIn(name), seconds=.65)
        until(8)
        # 8–18: project each key onto q, then grow its score bar.
        play(m.Create(bar_axis), m.FadeIn(score_title), m.FadeIn(bar_names))
        score_numbers, guides = [], []
        for j, (key, score) in enumerate(zip(keys, scores)):
            end, projection = point(key), point([0, key[1]])
            guide = m.Line(end, projection, color=MUTED, stroke_width=2)
            guides.append(guide)
            particle = m.Dot(end, radius=.10, color=GOLD)
            play(m.Create(guide), m.FadeIn(particle), seconds=.35)
            play(particle.animate.move_to(projection), seconds=.75)
            tall = m.Rectangle(width=.66, height=bar_scale*score, color=GOLD, fill_color=GOLD,
                               fill_opacity=.65, stroke_width=0).move_to([score_x[j], baseline+bar_scale*score/2, 0])
            number = equation(f'{score:.3f}', score_x[j], baseline+bar_scale*score+.31, 35, GOLD)
            play(m.ReplacementTransform(bars[j], tall), m.FadeIn(number), m.FadeOut(particle), seconds=.8)
            bars[j] = tall
            score_numbers.append(number)
        until(18)
        # 18–26: reveal the future mask after the prediction checkpoint21.8.
        question = equation('?', score_x[2], 2.25, 66, RED)
        play(m.FadeOut(score_title), m.FadeIn(question), seconds=.5)
        until(22.5)
        cross = m.VGroup(m.Line([4.85, -.6, 0], [5.75, 1.65, 0], color=RED, stroke_width=5),
                         m.Line([4.85, 1.65, 0], [5.75, -.6, 0], color=RED, stroke_width=5))
        forbidden = equation(r'-\infty', score_x[2], 1.95, 48, RED)
        play(m.FadeOut(bars[2]), m.FadeOut(score_numbers[2]), m.FadeOut(question),
             m.Create(cross), m.FadeIn(forbidden), seconds=.9)
        until(26)
        # 26–35: exact normalized weights occupy one unit interval.
        play(m.FadeOut(axes), m.FadeOut(query), m.FadeOut(query_name),
             *(m.FadeOut(a) for a in key_arrows), *(m.FadeOut(n) for n in key_names),
             *(m.FadeOut(g) for g in guides),
             m.FadeOut(bar_axis), m.FadeOut(bar_names), m.FadeOut(cross), m.FadeOut(forbidden),
             m.FadeOut(bars[0]), m.FadeOut(bars[1]), m.FadeOut(score_numbers[0]), m.FadeOut(score_numbers[1]), seconds=.6)
        probability = equation(r'a=\operatorname{softmax}(s)', y=1.85, size=62)
        partitions, left, colors = [], -5.2, [CYAN, GOLD, PURPLE]
        for j, weight in enumerate(weights[:2]):
            width = 10.4*weight
            partitions.append(m.Rectangle(width=width, height=.74, color=colors[j], fill_color=colors[j],
                                           fill_opacity=.65, stroke_width=0).move_to([left+width/2, .25, 0]))
            left += width
        play(m.FadeIn(probability), *(m.GrowFromCenter(p) for p in partitions), seconds=1.4)
        percentages = m.VGroup(*(equation(f'{w*100:.1f}\\%', p.get_center()[0], -.48, 48, colors[j])
                                for j, (w, p) in enumerate(zip(weights, partitions))))
        zero = equation('0', 5.7, .25, 47, RED)
        unit = m.VGroup(equation('1', y=-1.22, size=43, color=MUTED),
                        m.Line([-5.2, -.9, 0], [5.2, -.9, 0], color=MUTED, stroke_width=2),
                        m.Line([-5.2, -.8, 0], [-5.2, -.9, 0], color=MUTED, stroke_width=2),
                        m.Line([5.2, -.8, 0], [5.2, -.9, 0], color=MUTED, stroke_width=2))
        play(m.FadeIn(percentages), m.FadeIn(zero), m.FadeIn(unit))
        until(35)
        # 35–46: scale actual V arrows, then add them head to tail.
        play(m.FadeOut(probability), *(m.FadeOut(p) for p in partitions), m.FadeOut(percentages),
             m.FadeOut(zero), m.FadeOut(unit), seconds=.5)
        origin, scale = [-3.8, -.9, 0], 2.65
        v_axes = m.VGroup(arrow(point([-.12, 0]), point([1.72, 0]), MUTED, 2),
                         arrow(point([0, -.12]), point([0, 1.18]), MUTED, 2),
                         equation('V_0', .95, -.9, 35, MUTED), equation('V_1', -3.8, 2.5, 35, MUTED),
                         equation('1', -1.15, -1.24, 30, MUTED), equation('1', -4.1, 1.75, 30, MUTED))
        vectors = [arrow(point([0, 0]), point(v), colors[j], 4) for j, v in enumerate(values)]
        v_labels = [equation(f'v_{j}', point(v)[0]+.26, point(v)[1]+.26, 39, colors[j])
                    for j, v in enumerate(values)]
        play(m.Create(v_axes), *(m.Create(v) for v in vectors), *(m.FadeIn(n) for n in v_labels), seconds=1)
        until(37)
        scaled = [[weights[j]*x for x in v] for j, v in enumerate(values)]
        terms = [arrow(point([0, 0]), point(scaled[j]), colors[j], 7) for j in range(2)]
        play(m.ReplacementTransform(vectors[0], terms[0]), m.ReplacementTransform(vectors[1], terms[1]),
             m.FadeOut(vectors[2]), *(m.FadeOut(n) for n in v_labels), seconds=1.5)
        translated = arrow(point(scaled[0]), point(result), GOLD, 7)
        play(m.ReplacementTransform(terms[1], translated), seconds=1.5)
        output = arrow(point([0, 0]), point(result), GREEN, 8)
        output_dot = m.Dot(point(result), radius=.11, color=GREEN)
        compact = equation(r'o=\sum_j a_jv_j', 3.5, 1.3, 56, GREEN)
        numeric = equation(r'\approx(0.706,\ 0.587)', 3.5, .25, 52, GREEN)
        play(m.Create(output), m.FadeIn(output_dot), m.FadeIn(compact), m.FadeIn(numeric), seconds=1)
        until(46)
        # Keep the result on screen for the next experiment; no closing text slide.
        future = arrow(point([0, 0]), point(values[2]), PURPLE, 2)
        next_case = equation(r'v_2\;?', point(values[2])[0]+.45, point(values[2])[1], 46, PURPLE)
        play(m.Create(future), m.FadeIn(next_case), seconds=.8)
        until(50)
