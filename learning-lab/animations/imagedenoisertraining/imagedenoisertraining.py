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
        d=DATA["data"]
        def pixels(values,cx,small=False):
            side=.54 if not small else .21;gap=side+.04
            return m.VGroup(*(m.Rectangle(width=side,height=side,color=GREEN if value>=0 else GOLD,fill_color=GREEN if value>=0 else GOLD,fill_opacity=.15+.85*min(1,abs(value)),stroke_width=.7).move_to([cx+(i%4-1.5)*gap,1.25-(i//4)*gap,0]) for i,value in enumerate(values)))
        left=pixels(d["sample"]["noise"],-3.1)
        right=pixels(d["a"]["prediction"],3.1)
        equation=formula(r"L=\|\widehat\epsilon-\epsilon\|^2",0,3,45)
        names=m.VGroup(formula(r"\epsilon",-3.1,2.15,38,GREEN),formula(r"\widehat\epsilon_\theta",3.1,2.15,38,BLUE))
        parameter=formula(r"\eta=0.06",0,-1.35,34,GOLD)
        self.add(left,right,equation,names,parameter,text("|pixel|≤1: цвет",0,2.2,24,MUTED))
        question=formula("?",0,.55,54,GOLD)
        until(6);play(m.FadeIn(question),seconds=.4);until(12);play(m.FadeOut(question),seconds=.4)
        old=pixels(d["a"]["prediction"],3.1)
        old.set_opacity(.2);self.add(old)
        play(m.Transform(right,pixels(d["b"]["prediction"],3.1)),seconds=3)
        residuals=m.VGroup(*(m.Line([-1.95,1.25-i*.58,0],[1.95,1.25-i*.58,0],color=MUTED,stroke_width=1) for i in range(4)))
        play(m.Create(residuals),seconds=.7);until(18)
        play(m.FadeOut(residuals),m.FadeOut(old),m.Transform(left,pixels(d["trajectory"][0]["pixels"],-3.1)),m.Transform(right,pixels(d["ditTrajectory"][0]["pixels"],3.1)),m.Transform(names,m.VGroup(text("U-Net",-3.1,2.15,31,BLUE),text("DiT",3.1,2.15,31,PURPLE))),m.Transform(equation,formula(r"x_t\to\widehat\epsilon_\theta\to x_{t-1}",0,3,45)),m.Transform(parameter,formula("seed=701",0,-1.35,32,GOLD)),seconds=.6)
        counter=formula("t=8",0,.6,38);self.add(counter)
        for i in range(1,9):
            play(m.Transform(left,pixels(d["trajectory"][i]["pixels"],-3.1)),m.Transform(right,pixels(d["ditTrajectory"][i]["pixels"],3.1)),m.Transform(counter,formula(f"t={8-i}",0,.6,38)),seconds=.75)
        until(26)
        # Keep both generated images. Compact initial-noise thumbnails remain for comparison.
        initialLeft=pixels(d["trajectory"][0]["pixels"],-5.6,True)
        initialRight=pixels(d["ditTrajectory"][0]["pixels"],5.6,True)
        play(m.FadeIn(initialLeft),m.FadeIn(initialRight),seconds=.8)
        self.add(formula("x_8",-5.6,-.1,27,MUTED),formula("x_8",5.6,-.1,27,MUTED))
        until(34)
        focus=m.Rectangle(width=parameter.width+.25,height=parameter.height+.2,color=GOLD).move_to(parameter.get_center())
        play(m.Create(focus),seconds=.7);until(40)
