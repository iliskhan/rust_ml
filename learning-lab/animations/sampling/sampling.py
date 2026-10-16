"""Numerical causal geometry, exported from the lab's TypeScript math."""
import json
import sys
from pathlib import Path
import manimgx as m
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from topic_scene import text as base_text, arrow, INK, MUTED, BLUE, GOLD, GREEN, PURPLE


LABELS = {'z = Σ wᵢaᵢ + b     a = tanh(z)': 'tanh(Wx + b)', 'Вход: строка y, столбец x': 'x, y', 'Выход: строка 0': 'Conv[0]', 'Σ окна x·w → одна ячейка; w общие': 'Σ x·w', 'Вклады окон в общий dw[1,2]': 'dw[1,2] окон', 'Σ вкладов = градиент общего веса': 'Σ dw', 'w ← w − η·dw': 'w − η·dw', 't: порядок шагов →; h: значение состояния': 't →     h', 'Прямой проход →; ошибка на выходе': 'forward →', 'Σ вкладов → общий параметр → SGD': 'Σ → SGD', 'FFN: 4 → 6 → 4, отдельно по позициям': 'FFN 4 → 6 → 4', 'Таблица E[id, признак]': 'E[id]', 'Одинаковый ID → одна строка E': 'E[id]', 'Исходный x': 'x', 'Ветка FFN': 'FFN', 'Pre: x + FFN(LN(x))': 'x + FFN(LN(x))', 'Self: строки Q, столбцы K': 'Self: Q × K', 'Causal: j ≤ i        Cross: Q decoder, KV encoder': 'j ≤ i', 'Генерация выбирает; teacher forcing задаёт префикс': 'sampling', 'Фиксированное h позиции 1': 'h[1]', 'W до шага: строка 0': 'W[0]', 'dW: строка 0': 'dW[0]', 'W ← W − η dW; h не обновляется': 'W − η·dW', 'Начальные символы корпуса': 'символы', 'Соседние пары → частоты → правило': 'пара → частота', 'Корпус после выбранного слияния': 'корпус', 'Новый текст: те же правила, без переобучения': 'правила → текст', 'Up: линейная проекция': 'up', 'Gate: SiLU другой проекции': 'SiLU(gate)', '× по координатам, затем W_down': '⊙ → Wdown', 'Узкий код': 'код', 'W фиксирована; Wx + BAx': 'Wx + BAx', 'Кэш: content 2 + RoPE key 2': 'c₂ + kᴿ₂', 'Пиксели: строка y, столбец x': 'x, y', 'Токены патчей': 'патчи', '4 пикселя → 2 признака + позиция': '4 → 2 + P', 'ID токена': 'x[0]', 'Router: top-2': 'top-2', 'Токен 0: веса принятых маршрутов': 'α[0]', 'Выход = Σ вес × ответ эксперта': 'Σ α·expert', 'Плитки ключей K/V: диапазоны индексов': 'K/V: диапазоны i', 'Общий acc / l': 'acc / l', 'U-Net: размеры карты; верхняя связь — skip': 'U-Net: H × W', 'DiT: признаки патча 0 после time-conditioning': 'DiT[0]', 'Logits: шесть токенов словаря': 'logits', 'Вероятности после фильтров': 'p', 'Teacher forcing: цели': 'цели', 'CE по teacher-позициям': 'CEₜ', 'u; выбранный ID': 'u, ID'}

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
        logits=row(n["logits"],y=1.2,label="Logits по ID словаря",color=BLUE)
        slots=m.VGroup(*(cell("?",(i-2.5)*1.3,-.2,GREEN) for i in range(6)))
        play(m.FadeIn(logits),m.FadeIn(slots))

        question=text("?",y=-1.5,size=38,color=GOLD)
        until(6)
        play(m.FadeIn(question),seconds=.4)
        until(12)
        play(m.FadeOut(question),seconds=.25)
        probs=n["distribution"]["filtered"]
        bars=m.VGroup()
        for i,p in enumerate(probs):
            bar=m.Rectangle(width=.85,height=max(.015,p*4),color=GREEN,fill_opacity=.5).move_to([(i-2.5)*1.3,-.65+p*2,0])
            bars.add(bar)
        play(m.FadeOut(logits),m.FadeOut(slots),m.FadeIn(bars),seconds=1)
        ribbon=m.VGroup();left=-5.1
        for i,p in enumerate(probs):
            width=max(.001,p*10.2)
            ribbon.add(m.Rectangle(width=width,height=.42,color=GOLD if i==n["chosen"] else BLUE,fill_opacity=.55).move_to([left+width/2,-1.05,0]))
            left+=width
        play(m.FadeIn(ribbon))
        marker=m.Dot([-5.1,-1.05,0],radius=.10,color=INK);self.add(marker)
        play(marker.animate.move_to([-5.1+n["uniform"]*10.2,-1.05,0]),seconds=1.8)
        play(m.FadeIn(text(f"u={n['uniform']} → ID {n['chosen']}",y=2.0,size=44,color=GOLD)))
        play(m.FadeIn(text("Генерация выбирает; teacher forcing задаёт префикс",y=-1.6,size=30,color=MUTED)))

        # CONTINUOUS_COMPARISON: keep the actual mechanism in view.
        until(26)
        mechanism=m.VGroup(*list(self.mobjects))
        self.add(mechanism)
        play(mechanism.animate.scale(.72).shift([0,-.3,0]),seconds=.6)
        a={"label":"TF: вход","values":n["teacherInput"]}
        b={"label":"TF: цель","values":n["targets"]}
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
        focus=marker
        frame=m.Rectangle(width=focus.width+.04,height=focus.height+.04,color=PURPLE,stroke_width=3).move_to(focus.get_center())
        prompt=text("?",-5.8,-1.5,size=40,color=PURPLE)
        play(m.Create(frame),m.FadeIn(prompt),seconds=.5)
        play(frame.animate.scale(1.02),seconds=.5)
        until(40)
