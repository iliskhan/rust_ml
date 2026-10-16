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
        g=DATA["geometry"]
        def point(p):
            return [-5.1+10.2*(p[0]-g["xRange"][0])/(g["xRange"][1]-g["xRange"][0]),-.8+2.7*(p[1]-g["yRange"][0])/(g["yRange"][1]-g["yRange"][0]),0]
        axes=m.VGroup(m.Line([-5.3,-1,0],[5.4,-1,0],color=MUTED,stroke_width=2),m.Line([-5.3,-1,0],[-5.3,2.1,0],color=MUTED,stroke_width=2))
        self.add(axes,formula(r"\dot x=v_\theta(x,t)",0,3,48),formula("x",5.7,-1,33,MUTED),formula("y",-5.6,2.5,33,MUTED))
        for i in range(2):
            self.add(text(f'{g["xRange"][i]:.2f}',-5.1+10.2*i,-1.3,23,MUTED),text(f'{g["yRange"][i]:.2f}',-5.8,-.8+2.7*i,23,MUTED))
        colors=[BLUE,GOLD,GREEN,PURPLE]
        ghosts=m.VGroup(*(m.Line(point(a),point(b),color=MUTED,stroke_width=1) for path in g["before"] for a,b in zip(path,path[1:])))
        ghosts.set_opacity(.45)
        self.add(ghosts,text("θ₀",-4.5,2.35,25,MUTED))
        particles=[m.Dot(point(path[0]),radius=.09,color=colors[i]) for i,path in enumerate(g["after"])]
        starts=m.VGroup(*(m.Circle(radius=.1,color=colors[i],stroke_width=2).move_to(point(path[0])) for i,path in enumerate(g["after"])))
        parameter=formula(r"\Delta t=1/32",3.8,2.4,34,GOLD)
        self.add(starts,*particles,parameter)
        question=formula("?",0,2.35,50,GOLD)
        until(6);play(m.FadeIn(question),seconds=.4);until(12);play(m.FadeOut(question),seconds=.4)
        self.add(text("θ₁",-3.4,2.35,25,BLUE))
        for step in range(1,33):
            lines=[m.Line(point(path[step-1]),point(path[step]),color=colors[i],stroke_width=3) for i,path in enumerate(g["after"])]
            play(*(m.Create(line) for line in lines),*(particle.animate.move_to(point(g["after"][i][step])) for i,particle in enumerate(particles)),seconds=.3)
        until(26)
        ends=m.VGroup(*(m.Circle(radius=.16,color=colors[i],stroke_width=2).move_to(point(path[-1])) for i,path in enumerate(g["after"])))
        play(m.Create(ends),seconds=1)
        until(34)
        focus=m.Rectangle(width=parameter.width+.3,height=parameter.height+.2,color=GOLD).move_to(parameter.get_center())
        play(m.Create(focus),seconds=.7);until(40)
