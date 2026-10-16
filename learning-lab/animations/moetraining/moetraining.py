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
        d=DATA["data"];samples=d["samples"];a=d["a"];b=d["b"]
        values=[s["target"] for s in samples]+[v for row in a["rows"]+b["rows"] for v in row["experts"]]
        lo=min(values)-.1;hi=max(values)+.1
        def point(x,y):return [-5.2+(x+1.4)/2.8*4.4,-.8+(y-lo)/(hi-lo)*2.6,0]
        def curve(rows,j,color):return m.VGroup(*(m.Line(point(samples[i]["x"],rows[i]["experts"][j]),point(samples[i+1]["x"],rows[i+1]["experts"][j]),color=color,stroke_width=3) for i in range(len(samples)-1)))
        self.add(formula(r"\widehat y=p_1E_1+p_2E_2",0,3,45),m.Line([-5.35,-1,0],[-.55,-1,0],color=MUTED),m.Line([-5.35,-1,0],[-5.35,2,0],color=MUTED),formula("x",-.25,-1,38,MUTED),formula("E",-5.7,2.4,34,MUTED))
        self.add(text("-1.4",-5.2,-1.3,24,MUTED),text("1.4",-.8,-1.3,24,MUTED),text(f"{lo:.2f}",-5.85,-.8,22,MUTED),text(f"{hi:.2f}",-5.85,1.8,22,MUTED))
        target=m.VGroup(*(m.Line(point(samples[i]["x"],samples[i]["target"]),point(samples[i+1]["x"],samples[i+1]["target"]),color=GREEN,stroke_width=2) for i in range(len(samples)-1)))
        before=[curve(a["rows"],j,MUTED) for j in range(2)]
        experts=[curve(a["rows"],j,[BLUE,GOLD][j]) for j in range(2)]
        self.add(target,*before,*experts,formula(r"|x|",-4.5,2.35,30,GREEN))
        parameter=formula(r"\eta=0.12",3.8,2.35,34,GOLD);self.add(parameter)
        def routing(index):
            row=b["rows"][index];sample=samples[index]
            objects=[formula(f'x={sample["x"]:.1f}',.8,1.3,27),formula(f'E_1={row["experts"][0]:.2f}',3,1.3,28,BLUE),formula(f'E_2={row["experts"][1]:.2f}',3,-.65,28,GOLD),formula(rf'\hat y={row["output"]:.2f}',5.1,-1.25,28,GREEN)]
            for j,y in enumerate([1.3,-.65]):
                color=[BLUE,GOLD][j];p=row["probabilities"][j]
                objects.extend([m.Line([.9,.75,0],[2.1,y,0],color=color,stroke_width=1+6*p),m.Line([3.8,y,0],[4.7,.25,0],color=color,stroke_width=1+6*p),formula(f'{p:.2f}',1.65,[1.7,-1.2][j],28,color)])
            return m.VGroup(*objects)
        question=formula("?",-.15,2.3,50,GOLD)
        until(6);play(m.FadeIn(question),seconds=.4);until(12);play(m.FadeOut(question),seconds=.4)
        for j in range(2):play(m.Transform(experts[j],curve(b["rows"],j,[BLUE,GOLD][j])),seconds=2.3)
        route=routing(1);self.add(route)
        probe=m.Dot(point(samples[1]["x"],b["rows"][1]["output"]),radius=.08,color=PURPLE);self.add(probe)
        for i in range(2,14):
            play(m.Transform(route,routing(i)),probe.animate.move_to(point(samples[i]["x"],b["rows"][i]["output"])),seconds=.45)
        until(26)
        mixture=m.VGroup(*(m.Line(point(samples[i]["x"],b["rows"][i]["output"]),point(samples[i+1]["x"],b["rows"][i+1]["output"]),color=PURPLE,stroke_width=3) for i in range(len(samples)-1)))
        play(m.Create(mixture),seconds=1)
        until(34)
        focus=m.Rectangle(width=parameter.width+.25,height=parameter.height+.2,color=GOLD).move_to(parameter.get_center())
        play(m.Create(focus),seconds=.7);until(40)
