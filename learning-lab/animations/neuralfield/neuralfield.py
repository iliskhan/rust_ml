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
        d=DATA["data"];a=d["a"];b=d["b"]
        lo,hi=b["depths"][0],b["depths"][-1]
        def x(depth):return -4.9+9.8*(depth-lo)/(hi-lo)
        def pt(depth,T):return [x(depth),-.75+1.9*T,0]
        self.add(formula(r"w_i=T_i\alpha_i",0,3,50),formula(r"T", -5.95,.3,35,MUTED),formula(r"s\ \mathrm{(scene)}",0,-1.45,33,MUTED))
        axes=m.VGroup(m.Line([-5.2,-.75,0],[5.2,-.75,0],color=MUTED),m.Line([-5.2,-.75,0],[-5.2,1.2,0],color=MUTED))
        ray=m.Line([-5.05,1.95,0],[5.05,1.95,0],color=MUTED,stroke_width=2)
        self.add(axes,ray,text("1",-5.55,1.15,24,MUTED),text("0",-5.55,-.75,24,MUTED),text(f"{lo:.2f}",-4.9,-1,23,MUTED),text(f"{hi:.2f}",4.9,-1,23,MUTED))
        old=m.VGroup(*(m.Line(pt(a["depths"][i],a["trace"][i]["transmittance"]),pt(a["depths"][i+1],a["trace"][i+1]["transmittance"]),color=MUTED,stroke_width=2) for i in range(31)))
        self.add(old,text("σ × 0.5",-3.8,2.45,25,MUTED))
        parameter=formula(r"\sigma\times1",3.9,2.45,34,GOLD);self.add(parameter)
        def rgb(c):return "#"+"".join(f"{round(max(0,min(1,v))*255):02x}" for v in c)
        samples=m.VGroup(*(m.Circle(radius=.04+.1*row["density"]/6,color=rgb(row["color"]),fill_color=rgb(row["color"]),fill_opacity=.7,stroke_width=1).move_to([x(depth),1.95,0]) for depth,row in zip(b["depths"],b["trace"])))
        self.add(samples)
        question=formula("?",0,2.45,50,GOLD)
        until(6);play(m.FadeIn(question),seconds=.4);until(12);play(m.FadeOut(question),seconds=.4)
        light=m.Dot([x(lo),1.95,0],radius=.1,color=GOLD)
        transmission=m.Dot(pt(lo,b["trace"][0]["transmittance"]),radius=.07,color=BLUE)
        self.add(light,transmission)
        for i in range(1,32):
            line=m.Line(pt(b["depths"][i-1],b["trace"][i-1]["transmittance"]),pt(b["depths"][i],b["trace"][i]["transmittance"]),color=BLUE,stroke_width=3)
            play(m.Create(line),light.animate.move_to([x(b["depths"][i]),1.95,0]),transmission.animate.move_to(pt(b["depths"][i],b["trace"][i]["transmittance"])),seconds=.3)
        until(26)
        pixel=m.Rectangle(width=.7,height=.7,color=rgb(b["color"]),fill_color=rgb(b["color"]),fill_opacity=1).move_to([5.8,1.95,0])
        play(m.GrowFromCenter(pixel),seconds=.8)
        self.add(text("RGB",5.8,1.35,24,MUTED),formula(f'T_{{end}}={b["transmittance"]:.4f}',2.8,.75,32,BLUE))
        until(34)
        focus=m.Rectangle(width=parameter.width+.25,height=parameter.height+.2,color=GOLD).move_to(parameter.get_center())
        play(m.Create(focus),seconds=.7);until(40)
