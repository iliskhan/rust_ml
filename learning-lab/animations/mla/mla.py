"""Numerical causal geometry, exported from the lab's TypeScript math."""
import json
import sys
from pathlib import Path
import manimgx as m
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from topic_scene import text as base_text, arrow, INK, MUTED, BLUE, GOLD, GREEN, PURPLE


LABELS = {'z = Σ wᵢaᵢ + b     a = tanh(z)': 'tanh(Wx + b)', 'Вход: строка y, столбец x': 'x, y', 'Выход: строка 0': 'Conv[0]', 'Σ окна x·w → одна ячейка; w общие': 'Σ x·w', 'Вклады окон в общий dw[1,2]': 'dw[1,2] окон', 'Σ вкладов = градиент общего веса': 'Σ dw', 'w ← w − η·dw': 'w − η·dw', 't: порядок шагов →; h: значение состояния': 't →     h', 'Прямой проход →; ошибка на выходе': 'forward →', 'Σ вкладов → общий параметр → SGD': 'Σ → SGD', 'FFN: 4 → 6 → 4, отдельно по позициям': 'FFN 4 → 6 → 4', 'Таблица E[id, признак]': 'E[id]', 'Одинаковый ID → одна строка E': 'E[id]', 'Исходный x': 'x', 'Ветка FFN': 'FFN', 'Pre: x + FFN(LN(x))': 'x + FFN(LN(x))', 'Self: строки Q, столбцы K': 'Self: Q × K', 'Causal: j ≤ i        Cross: Q decoder, KV encoder': 'j ≤ i', 'Генерация выбирает; teacher forcing задаёт префикс': 'teacher forcing', 'Фиксированное h позиции 1': 'h[1]', 'W до шага: строка 0': 'W[0]', 'dW: строка 0': 'dW[0]', 'W ← W − η dW; h не обновляется': 'W − η·dW', 'Начальные символы корпуса': 'символы', 'Соседние пары → частоты → правило': 'пара → частота', 'Корпус после выбранного слияния': 'корпус', 'Новый текст: те же правила, без переобучения': 'правила → текст', 'Up: линейная проекция': 'up', 'Gate: SiLU другой проекции': 'SiLU(gate)', '× по координатам, затем W_down': '⊙ → Wdown', 'Узкий код': 'код', 'W фиксирована; Wx + BAx': 'Wx + BAx', 'Кэш: content 2 + RoPE key 2': 'c₂ + kᴿ₂', 'Пиксели: строка y, столбец x': 'x, y', 'Токены патчей': 'патчи', '4 пикселя → 2 признака + позиция': '4 → 2 + P', 'ID токена': 'x[0]', 'Router: top-2': 'top-2', 'Токен 0: веса принятых маршрутов': 'α[0]', 'Выход = Σ вес × ответ эксперта': 'Σ α·expert', 'Плитки ключей K/V: диапазоны индексов': 'K/V: диапазоны i', 'Общий acc / l': 'acc / l', 'U-Net: размеры карты; верхняя связь — skip': 'U-Net: H × W', 'DiT: признаки патча 0 после time-conditioning': 'DiT[0]', 'Вход позиции 5: три признака': 'x[5]', 'Content c: два признака': 'c[5]', 'Голова 0: ответ': 'o[0]', 'Явное восстановление K/V': 'K/V', 'Поглощённая проекция': 'c → V'}

def text(words, *args, **kwargs):
    kwargs["size"] = max(40, kwargs.get("size", 48))
    return base_text(LABELS.get(str(words), words), *args, **kwargs)


def value(v, digits=2):
    if isinstance(v, (int, float)):
        return f"{v:.{digits}g}".replace("0.", ".")
    return "SP" if str(v) == " " else str(v)


def cell(v, x, y, color=BLUE, width=1.05, digits=2):
    box = m.Rectangle(width=width, height=.52, color=color, stroke_width=1).move_to([x, y, 0])
    label = (m.MathTex(value(v, digits), font_size=46, color=color)
             if isinstance(v, (int, float)) else text(value(v), size=40, color=color))
    if label.height > .38:
        label.scale(.38 / label.height)
    if label.width > width * .82:
        label.scale(width * .82 / label.width)
    label.move_to([x, y, 0])
    return m.VGroup(box, label)


def row(values, y=0, label="", color=BLUE, span=10.2):
    n = len(values)
    spacing = min(1.30, span / max(n, 1))
    group = m.VGroup(*(cell(v, (i-(n-1)/2)*spacing, y, color, min(1.12, spacing-.08)) for i,v in enumerate(values)))
    caption = text(label, y=y+.55, size=40, color=MUTED) if label else m.VGroup()
    return m.VGroup(caption, group)


def matrix(values, x=0, y=.3, color=BLUE, spacing=.64):
    return m.VGroup(*(cell(v, x+(j-(len(r)-1)/2)*spacing, y+((len(values)-1)/2-i)*spacing, color, spacing-.05, digits=1)
                      for i,r in enumerate(values) for j,v in enumerate(r)))


class TopicScene(m.Scene):
    def construct(self):
        f = json.loads(Path(__file__).with_name("fixture.json").read_text(encoding="utf-8"))
        n = f["numerical"]
        self.elapsed = 0
        def play(*animations, seconds=.6):
            self.play(*animations, run_time=seconds)
            self.elapsed += seconds
        def until(t):
            remaining = t-self.elapsed
            if remaining > 1e-8:
                self.wait(remaining)
                self.elapsed = t
        def wipe():
            play(*(m.FadeOut(obj) for obj in list(self.mobjects)), seconds=.4)
        scale_tag=cell(n["scale"],0,-.85,PURPLE)
        play(m.FadeIn(scale_tag),m.FadeIn(text("s",-.95,-.85,size=27,color=PURPLE)),seconds=.4)
        first=n["x"] if "x" in n else n["trace"]["x"][-1]
        latent=n["trace"]["latent"][-1] if "trace" in n else f["lanes"][1]["values"]
        left=m.VGroup(*(cell(v,-4.6+(i%2)*1.2 if len(first)>4 else -4.6,1.45-(i//2)*.8 if len(first)>4 else 1.45-i*.7,BLUE,width=1.08) for i,v in enumerate(first)))
        middle=m.VGroup(*(cell("?",0,1.0-i*.7,GOLD,width=1.1) for i in range(len(latent))))
        right=m.VGroup(*(cell("?",4.6,1.1-i*.7,GREEN,width=1.1) for i in range(len(f["lanes"][2]["values"]))))
        play(m.FadeIn(left),m.FadeIn(middle),m.FadeIn(right))
        play(m.FadeIn(text("Вход",-4.6,2.25,size=35)),m.FadeIn(text("c₅",0,2.25,size=40)),m.FadeIn(text("o₀",4.6,2.25,size=40)))

        question=text("?",y=-1.5,size=38,color=GOLD)
        until(6)
        play(m.FadeIn(question),seconds=.4)
        until(12)
        play(m.FadeOut(question),seconds=.25)
        projection=m.VGroup(*(arrow((-2.7,.65),(-.65,1-i*.7),GOLD) for i in range(len(latent))))
        history=m.VGroup(*(m.Dot([1.7,1.2-j*.4,0],radius=.055,color=BLUE) for j in range(5)))
        weights=m.VGroup(*(m.MathTex(value(weight),font_size=40,color=GOLD).move_to([1.1,1.2-j*.4,0]) for j,weight in enumerate(n["trace"]["heads"][0]["weights"][:5])))
        historical_label=m.MathTex(r"c_0\ldots c_4",font_size=40,color=BLUE).move_to([1.5,2.25,0])
        sigma_circle=m.Circle(radius=.38,color=GREEN,stroke_width=2).move_to([2.9,.65,0])
        sigma=m.MathTex(r"\Sigma",font_size=46,color=GREEN).move_to([2.9,.65,0])
        routes=m.VGroup(*(arrow((1.85,1.2-j*.4),(2.4,.65),GOLD) for j in range(5)))
        current_route=m.VGroup(m.Line([.65,.65,0],[.85,1.75,0],color=GOLD,stroke_width=3),m.Line([.85,1.75,0],[2.2,1.75,0],color=GOLD,stroke_width=3),arrow((2.2,1.75),(2.9,1.1),GOLD))
        current_weight=m.MathTex(value(n["trace"]["heads"][0]["weights"][5]),font_size=40,color=GOLD).move_to([3.35,1.7,0])
        readout=m.VGroup(*(arrow((3.35,.65),(3.95,1.1-i*.7),GREEN) for i in range(len(f["lanes"][2]["values"]))))
        play(m.Create(projection),m.FadeIn(history),m.FadeIn(weights),m.FadeIn(historical_label),m.Create(sigma_circle),m.FadeIn(sigma),m.Create(routes),m.Create(current_route),m.FadeIn(current_weight),m.Create(readout),m.FadeIn(text("Uᵥ",4.2,1.7,size=40,color=GREEN)))
        for i,v in enumerate(latent):
            play(m.ReplacementTransform(middle[i],cell(v,0,1-i*.7,GOLD)),seconds=.4)
        for i,v in enumerate(f["lanes"][2]["values"]):
            play(m.ReplacementTransform(right[i],cell(v,4.6,1.1-i*.7,GREEN)),seconds=.4)
        note="W фиксирована; Wx + BAx" if "initial" in n else "c₂ + kᴿ₂"
        play(m.FadeIn(text(note,x=3.5,y=-1.5,size=40,color=MUTED)))

        # CONTINUOUS_COMPARISON: keep the actual mechanism in view.
        until(26)
        mechanism=m.VGroup(*list(self.mobjects))
        self.add(mechanism)
        play(mechanism.animate.scale(.72).shift([0,-.3,0]),seconds=.6)
        a,b=f["comparison"]
        a={**a,"label":'K/V'}
        b={**b,"label":'c → V'}
        def case_row(values,y,caption,color):
            count=len(values)
            spacing=min(1.22,8.7/max(1,count))
            cells=m.VGroup(*(cell(v,(i-(count-1)/2)*spacing,y,color,width=min(1.10,spacing-.08)) for i,v in enumerate(values)))
            return m.VGroup(text(caption,-5.5,y,size=26,color=color),cells)
        before=case_row(a["values"],3.35,a["label"],BLUE)
        after=case_row(b["values"],2.45,b["label"],GREEN)
        play(m.FadeIn(before),m.FadeIn(after[0]),seconds=.5)
        for i,item in enumerate(after[1]):
            play(m.FadeIn(item),seconds=.25)
        if len(before[1])==len(after[1]):
            cursor=m.Line([-.3,0,0],[.3,0,0],color=GOLD,stroke_width=4).move_to(before[1][0].get_center()+[0,-.37,0])
            self.add(cursor)
            for upper,lower in zip(before[1],after[1]):
                play(cursor.animate.move_to(upper.get_center()+[0,-.37,0]),seconds=.18)
                play(m.FadeOut(cursor),seconds=.1)
                cursor=m.Line([-.3,0,0],[.3,0,0],color=GOLD,stroke_width=4).move_to(lower.get_center()+[0,-.37,0])
                play(m.FadeIn(cursor),seconds=.12)
            play(m.FadeOut(cursor),seconds=.25)
        until(34)
        focus=scale_tag
        frame=m.Rectangle(width=focus.width+.04,height=focus.height+.04,color=PURPLE,stroke_width=3).move_to(focus.get_center())
        prompt=text("?",-5.8,-1.5,size=40,color=PURPLE)
        play(m.Create(frame),m.FadeIn(prompt),seconds=.5)
        play(frame.animate.scale(1.02),seconds=.5)
        until(40)
