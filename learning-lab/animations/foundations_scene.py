"""Four small, numeric mechanisms sharing only the pacing and drawing tools."""
import json
from pathlib import Path
import manimgx as m
from topic_scene import text, formula, INK, MUTED, BLUE, GOLD, GREEN, PURPLE


class FoundationsScene(m.Scene):
    def construct(self):
        f = json.loads((Path(__file__).parent / self.slug / "fixture.json").read_text(encoding="utf-8"))
        figure, reveal, stats = getattr(self, self.slug)(f)
        self.play(m.Create(figure), run_time=1)
        self.wait(5)
        question = formula('?', x=5.6, y=2.9, size=48, color=GOLD)
        self.play(m.FadeIn(question), run_time=.4)
        self.wait(5.6)
        self.play(m.FadeOut(question), run_time=.3)
        reveal()
        self.wait(11.7)
        self.play(m.FadeIn(stats), run_time=.5)
        self.wait(7.5)
        parameter = formula({'activations':'z\;?', 'mse':r'\hat y\;?', 'bce':'p\;?', 'boundary':r'\eta\;?'}[self.slug],
                            x=5.5,y=2.9,size=45,color=BLUE)
        self.play(m.FadeIn(parameter), run_time=.6)
        self.wait(5.4)

    def activations(self, f):
        def point(z, a): return [z*1.6, -.1+a*.7, 0]
        axes = m.VGroup(m.Line(point(-3.4,0),point(3.4,0),color=MUTED),m.Line(point(0,-1),point(0,3.2),color=MUTED),
                        text("z", x=5.8,y=-.25,size=38),text("a",x=-.35,y=2.3,size=38),
                        text("−3",x=-4.8,y=-.6,size=33),text("3",x=4.8,y=-.6,size=33))
        colors=[BLUE,GOLD,PURPLE]
        curves=m.VGroup(*(m.Line(point(*a),point(*b),color=color,stroke_width=4)
                          for curve,color in zip(f['curves'],colors) for a,b in zip(curve['points'],curve['points'][1:])))
        dots=[m.Dot(point(*curve['points'][12]),radius=.095,color=color) for curve,color in zip(f['curves'],colors)]
        legend=m.VGroup(*(text(name,x=-3.4+i*3.4,y=-1.25,size=39,color=color) for i,(name,color) in enumerate(zip(['ReLU','sigmoid','tanh'],colors))))
        figure=m.VGroup(axes,curves,*dots,legend)
        def reveal():
            for j in range(13,25):
                self.play(*(dot.animate.move_to(point(*curve['points'][j])) for dot,curve in zip(dots,f['curves'])),run_time=2/12)
        stats=formula(r"\sigma':\;0.25\;\longrightarrow\;0.045",y=3.0,size=43,color=GREEN)
        return figure,reveal,stats

    def mse(self,f):
        def point(i,value):return [-3.6+i*3.6,-.75+value*.8,0]
        axes=m.VGroup(m.Line([-5.2,-.75,0],[5.4,-.75,0],color=MUTED),text("Номер примера i",y=-1.6,size=32),
                       text("Цель / прогноз",x=-4.3,y=2.3,size=30,color=MUTED))
        targets=[m.Dot(point(i,t),radius=.13,color=GREEN) for i,t in enumerate(f['targets'])]
        predictions=[m.Dot(point(i,p),radius=.085,color=GOLD) for i,p in enumerate(f['before'])]
        labels=m.VGroup(*(text(str(i+1),x=point(i,0)[0],y=-1.0,size=32) for i in range(3)))
        goal_labels=m.VGroup(*(text(f"y={t}",x=point(i,t)[0]-.6,y=point(i,t)[1],size=34,color=GREEN) for i,t in enumerate(f['targets'])))
        residuals=m.VGroup(*(m.Line(point(i,t),point(i,p),color=GOLD,stroke_width=4)
                             for i,(t,p) in enumerate(zip(f['targets'],f['before']))))
        squares=m.VGroup(*(m.Rectangle(width=abs(t-p)*.8,height=abs(t-p)*.8,stroke_width=0,
                                       fill_color=GOLD,fill_opacity=.25).move_to([point(i,0)[0]+.8,.1,0])
                            for i,(t,p) in enumerate(zip(f['targets'],f['before']))))
        figure=m.VGroup(axes,*targets,*predictions,labels,goal_labels,residuals,squares)
        def reveal():
            self.play(predictions[2].animate.move_to(point(2,f['after'][2])),
                      m.FadeOut(residuals[2]),squares[2].animate.scale(.001),run_time=2)
        stats=formula(r"L=\frac{1}{3}\sum_i(\hat y_i-y_i)^2:\quad\frac12\to\frac16",y=3.25,size=39,color=GREEN)
        return figure,reveal,stats

    def bce(self,f):
        def point(p,loss):return [-4.8+p*9.6,-.75+loss*.83,0]
        axes=m.VGroup(m.Line(point(0,0),point(1,0),color=MUTED),m.Line(point(0,0),point(0,3.4),color=MUTED),
                       text("Вероятность p",y=-1.35,size=39),text("BCE, y=1",x=-3.9,y=2.4,size=40),
                       text("0",x=-4.8,y=-1.05,size=30),text("1",x=4.8,y=-1.05,size=30))
        curve=m.VGroup(*(m.Line(point(*a),point(*b),color=BLUE,stroke_width=4) for a,b in zip(f['curve'],f['curve'][1:])))
        dot=m.Dot(point(f['probabilities'][0],f['losses'][0]['loss']),radius=.11,color=GOLD)
        figure=m.VGroup(axes,curve,dot)
        def reveal():
            for sample in f['curve'][4:16]:self.play(dot.animate.move_to(point(*sample)),run_time=2/12)
        stats=formula(r"L=-\log p:\quad1.609\;\longrightarrow\;0.223",y=3.0,size=43,color=GREEN)
        return figure,reveal,stats

    def boundary(self,f):
        def point(x,y):return [-4.0+x*5.5,-.9+y*2.8,0]
        def color(p):return '#315F72' if p<.5 else '#886B38'
        cells=m.VGroup(*(m.Rectangle(width=5.5/12+.01,height=2.8/12+.01,fill_color=color(cell[2]),fill_opacity=.7,stroke_width=0).move_to(point(cell[0],cell[1])) for row in f['states'][0]['grid'] for cell in row))
        train=m.VGroup(*(m.Dot(point(*row['input']),radius=.027,color=BLUE if row['target']==0 else GOLD) for row in f['dataset']['train']))
        validation=m.VGroup(*(m.Circle(radius=.055,color=INK,fill_color='#101622',fill_opacity=1,stroke_width=2).move_to(point(*row['input'])) for row in f['dataset']['validation']))
        labels=m.VGroup(text("Вход x₁",x=-1.25,y=-1.65,size=32),text("x₂",x=-4.7,y=.6,size=36),
                         text("Train: 96",x=3.6,y=1.65,size=40,color=BLUE),text("Порог p = 0.5",x=3.6,y=.7,size=38),
                         text("0 → 400 шагов",x=3.6,y=-.3,size=38,color=MUTED),
                         text("Validation: 32",x=3.6,y=-1.15,size=36,color=INK),
                         text("0",x=-4.0,y=-1.2,size=28),text("1",x=1.5,y=-1.2,size=28),
                         text("0",x=-4.4,y=-.9,size=28),text("1",x=-4.4,y=1.9,size=28))
        figure=m.VGroup(cells,train,validation,labels)
        # Hide held-out markers until after the training demonstration.
        validation.set_opacity(0)
        def reveal():
            for state in f['states'][1:]:
                flattened=[cell for row in state['grid'] for cell in row]
                self.play(*(rect.animate.set_color(color(cell[2])) for rect,cell in zip(cells,flattened)),run_time=.5)
            self.play(validation.animate.set_opacity(1),run_time=.5)
        final=f['states'][-1]['metrics']
        stats=text(f"BCE: train {final['train']['loss']:.3f} · validation {final['validation']['loss']:.3f}",y=3.0,size=34,color=GREEN)
        return figure,reveal,stats
