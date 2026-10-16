"""Silent causal geometry. Model quantities are read from the exported fixture."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from topic_scene import m, text, formula, arrow, INK, MUTED, BLUE, GOLD, GREEN, PURPLE
DATA=json.loads(Path(__file__).with_name("fixture.json").read_text(encoding="utf-8"))

class TopicScene(m.Scene):
    def construct(self):
        elapsed=0
        def play(*animations,seconds=.6):
            nonlocal elapsed
            self.play(*animations,run_time=seconds);elapsed+=seconds
        def until(t):
            nonlocal elapsed
            if elapsed<t:self.wait(t-elapsed);elapsed=t
        d=DATA["data"];k=d["kernel"];xs=[-4.5,-1.5,1.5,4.5]
        baseline=-.75;scale=3.5
        def bar(value,x,color,bottom=0,outline=False):
            height=max(.008,value*scale)
            return m.Rectangle(width=.8,height=height,color=color,fill_color=color,fill_opacity=0 if outline else .55,stroke_width=2).move_to([x,baseline+bottom*scale+height/2,0])
        equation=formula("p, q",0,3,47)
        self.add(equation,m.Line([-5.5,baseline,0],[5.5,baseline,0],color=MUTED))
        target=[bar(p,x,GREEN,outline=True) for p,x in zip(d["p"],xs)]
        drafts=[bar(q,x,GOLD) for q,x in zip(d["q"],xs)]
        names=m.VGroup(*(formula(str(i),x,-1.2,30,MUTED) for i,x in enumerate(xs)))
        parameter=formula(r"q=0.4p+0.6U",3.8,2.35,34,GOLD)
        qlabel=text("q",-3.9,2.4,28,GOLD)
        self.add(*target,*drafts,names,parameter,text("p",-4.7,2.4,28,GREEN),qlabel,formula("0",-5.8,baseline,27,MUTED))
        question=formula("?",0,2.35,50,GOLD)
        until(6);play(m.FadeIn(question),seconds=.4);until(12);play(m.FadeOut(question),m.Transform(equation,formula(r"p=\min(p,q)+\max(p-q,0)",0,3,47)),m.FadeOut(qlabel),seconds=.4)
        for i,draft in enumerate(drafts):
            play(m.Transform(draft,bar(k["acceptedMass"][i],xs[i],BLUE)),seconds=.7)
        accepted=text("min(p,q)",-3.5,2.4,25,BLUE)
        play(m.FadeIn(accepted),seconds=.5)
        additions=[]
        for i,x in enumerate(xs):
            value=k["rejected"]*k["residual"][i]
            extra=bar(value,x,PURPLE,k["acceptedMass"][i])
            if value>0:
                play(m.GrowFromCenter(extra),seconds=.7)
                additions.append(extra)
        until(26)
        self.add(text("max(p−q,0)",-.7,2.4,25,PURPLE))
        totals=m.VGroup(*(formula(f"{p:.2f}",x,baseline+scale*p+.3,32,GREEN) for p,x in zip(d["p"],xs)))
        play(m.FadeIn(totals),seconds=.8)
        until(34)
        focus=m.Rectangle(width=parameter.width+.25,height=parameter.height+.2,color=GOLD).move_to(parameter.get_center())
        play(m.Create(focus),seconds=.7);until(40)
