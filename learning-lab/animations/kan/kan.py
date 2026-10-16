"""Silent persistent geometry; every displayed endpoint comes from the TS fixture."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from topic_scene import m, text, formula, arrow, INK, MUTED, BLUE, GOLD, GREEN, PURPLE
DATA=json.loads(Path(__file__).with_name("fixture.json").read_text(encoding="utf-8"))
COLORS=[BLUE,GOLD,GREEN,PURPLE,"#D88B90"]
SLUG='kan'
KIND='curve'

class TopicScene(m.Scene):
    def construct(self):
        g=DATA["geometry"]
        elapsed=0
        def play(*animations,seconds=.6):
            nonlocal elapsed
            self.play(*animations,run_time=seconds);elapsed+=seconds
        def until(t):
            nonlocal elapsed
            if elapsed<t:self.wait(t-elapsed);elapsed=t
        def point(p):
            return [-5.1+10.2*(p[0]-g["xRange"][0])/(g["xRange"][1]-g["xRange"][0]),
                    -.8+2.6*(p[1]-g["yRange"][0])/(g["yRange"][1]-g["yRange"][0]),0]
        def dot(p,color,index=0):
            if SLUG=="clip" and index==1:
                return m.Circle(radius=.09,color=color,stroke_width=3).move_to(point(p))
            return m.Dot(point(p),radius=.055 if KIND=="curve" else .085,color=color)
        def series(values,color):
            if KIND=="bar":
                baseline=point([g["xRange"][0],0])[1]
                bars=[]
                for p in values:
                    end=point(p);height=max(.008,end[1]-baseline)
                    bars.append(m.Rectangle(width=.38,height=height,color=color,fill_color=color,fill_opacity=.35,stroke_width=2).move_to([end[0],baseline+height/2,0]))
                return m.VGroup(*bars)
            objects=[dot(p,color,i) for i,p in enumerate(values)]
            if KIND=="curve" or SLUG in ("clip","jepa"):
                objects.extend(m.Line(point(a),point(b),color=color,stroke_width=2) for a,b in zip(values,values[1:]) if a!=b)
            return m.VGroup(*objects)
        axes=m.VGroup(m.Line([-5.4,-.95,0],[5.5,-.95,0],color=MUTED,stroke_width=2),m.Line([-5.4,-.95,0],[-5.4,2,0],color=MUTED,stroke_width=2))
        labels=m.VGroup(formula('x,\\ y',0,-1.5,34,MUTED),formula('\\phi',-5.85,2.2,34,MUTED),
            *(text(f'{g["xRange"][i]:.2f}',-5.1+10.2*i,-1.15,22,MUTED) for i in range(2)),
            *(text(f'{g["yRange"][i]:.2f}',-5.9,-.8+2.6*i,22,MUTED) for i in range(2)))
        equation=formula('\\widehat f(x,y)=\\phi_x(x)+\\phi_y(y)+b',0,3.0,43)
        if equation.width>11.5:equation.scale(11.5/equation.width)
        parameter=formula('K=7',3.6,2.3,33,GOLD)
        self.add(axes,labels,equation,parameter)
        live=[series(v,COLORS[i%len(COLORS)]) for i,v in enumerate(g["before"])]
        for item in live:play(m.Create(item),seconds=.65)
        # The initial geometry stays visible through the prediction checkpoint.
        question=formula("?",0,2.3,48,GOLD)
        until(6);play(m.FadeIn(question),seconds=.4);until(12)
        play(m.FadeOut(question),seconds=.4)
        ghosts=[series(v,MUTED) for v in g["before"]]
        for ghost in ghosts:ghost.set_opacity(.35);self.add(ghost)
        # Each correspondence moves independently; before remains on the same numeric axes.
        for i,item in enumerate(live):
            play(m.Transform(item,series(g["after"][i],COLORS[i%len(COLORS)])),seconds=5.6/len(live))
        play(m.FadeIn(m.VGroup(formula(r"\phi_x" if "kan"=="kan" else "phi_x",-3.5,2.3,30,COLORS[0]),formula(r"\phi_y" if "kan"=="kan" else "phi_y",-1.9,2.3,30,COLORS[1]))),seconds=.5)
        until(26)
        legend=m.VGroup(text("до",4.3,-1.53,23,MUTED),text("после",5.35,-1.53,23,BLUE))
        play(m.FadeIn(legend),seconds=.5)
        # Trace differences at their actual coordinates, instead of a text comparison card.
        marks=m.VGroup()
        for k,(a,b) in enumerate(zip(g["before"],g["after"])):
            for i in range(0,len(a),max(1,len(a)//4)):
                if a[i]!=b[i]:marks.add(m.Line(point(a[i]),point(b[i]),color=COLORS[k%len(COLORS)],stroke_width=1.5))
        play(m.Create(marks),seconds=1)
        until(34)
        focus=m.Rectangle(width=parameter.width+.3,height=parameter.height+.22,color=GOLD,stroke_width=3).move_to(parameter.get_center())
        play(m.Create(focus),seconds=.7)
        until(40)
