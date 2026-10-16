"""Silent persistent mechanism; all numeric states are exported by the lab."""
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
        c=DATA["data"]["causal"];origin=(-3.9,.1)
        rays=m.VGroup()
        colors=[BLUE,GOLD,GREEN,PURPLE,"#D88B90"]
        for i,segment in enumerate(DATA["geometry"]["before"]):
            end=segment[-1]
            rays.add(arrow(origin,(origin[0]+end[0]*3,origin[1]+end[1]*3),colors[i]))
        axes=m.VGroup(m.Line([-5.5,.1,0],[-2.1,.1,0],color=MUTED),m.Line([-3.9,-1.2,0],[-3.9,1.5,0],color=MUTED))
        self.add(axes,rays,text("Автоэнкодер",-3.9,2.8,30),formula(r"\mathbb{R}^5\to\mathbb{R}^2",-3.9,2.1,35),formula("h_1",-2.1,-.2,26,MUTED),formula("h_2",-4.25,1.5,26,MUTED))
        def node(value,x,y,color=BLUE):
            return m.VGroup(m.Rectangle(width=1.4,height=.6,color=color,stroke_width=2).move_to([x,y,0]),formula(f"{value:.3f}",x,y,30,color))
        xs=[-.1,2.15,4.4]
        hidden=m.VGroup(*(node(v,x,.9) for v,x in zip(c["corrupt"]["hidden"],xs)))
        output=node(c["corrupt"]["logit"],2.15,-.8,GOLD)
        links=m.VGroup(*(arrow((x,.5),(2.15,-.4),MUTED) for x in xs))
        labels=m.VGroup(*(formula(f"h_{i}",x,1.4,28) for i,x in enumerate(xs)),formula(r"\ell",3.1,-.8,33,GOLD))
        source=node(c["clean"]["hidden"][0],-.1,2.1,GREEN)
        source_label=text("clean",-.1,2.65,24,GREEN)
        self.add(hidden,output,links,labels,source,source_label,text("Отдельная сеть",3.3,2.9,30))
        question=formula("?",2.15,2.15,52,GOLD)
        until(6);play(m.FadeIn(question),seconds=.4);until(12);play(m.FadeOut(question),seconds=.4)
        copy=source.copy();self.add(copy)
        play(copy.animate.move_to([-.1,.9,0]),seconds=2)
        play(m.FadeOut(copy),m.Transform(hidden[0],node(c["patched"]["hidden"][0],-.1,.9,GREEN)),seconds=.5)
        pulse=m.Dot([-.1,.5,0],radius=.08,color=GREEN);self.add(pulse)
        play(pulse.animate.move_to([2.15,-.4,0]),seconds=2)
        play(m.FadeOut(pulse),m.Transform(output,node(c["patched"]["logit"],2.15,-.8,GREEN)),seconds=.8)
        patch=formula(r"h_0\leftarrow h_0^{clean}",2.45,2.15,35,GREEN)
        play(m.FadeIn(patch),seconds=.5)
        until(26)
        previous=node(c["corrupt"]["logit"],4.9,-.8,MUTED)
        play(m.FadeIn(previous),m.FadeIn(text("ℓ до",4.9,-.2,24,MUTED)),seconds=.7)
        until(34)
        play(hidden[0][0].animate.set_color(GOLD),seconds=.7);until(40)
