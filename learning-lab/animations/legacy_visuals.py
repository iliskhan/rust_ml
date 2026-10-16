"""Persistent visual mechanisms for the original lessons; values stay fixture driven."""
import json
import math
from pathlib import Path
import manimgx as m
from topic_scene import text, formula, arrow, INK, MUTED, BLUE, GOLD, GREEN, PURPLE


def number(v):
    return f'{v:.3f}'.rstrip('0').rstrip('.') if isinstance(v, (float, int)) else str(v)


class VisualLesson(m.Scene):
    def construct(self):
        self.elapsed = 0
        f = json.loads((Path(__file__).parent/self.slug/'fixture.json').read_text(encoding='utf-8'))
        getattr(self, self.slug)(f)

    def show(self, *animations, seconds=.7):
        self.play(*animations, run_time=seconds)
        self.elapsed += seconds

    def until(self, time):
        if self.elapsed > time+1e-6:
            raise ValueError(f'Timeline overrun {self.slug}: {self.elapsed}>{time}')
        if self.elapsed < time:
            self.wait(time-self.elapsed)
            self.elapsed = time

    def pulse(self, a, b, color=BLUE, seconds=1):
        length=math.dist(a,b)
        unit=[(b[i]-a[i])/length for i in range(2)]
        inset=min(.68,length*.2)
        start=[a[i]+inset*unit[i] for i in range(2)]
        end=[b[i]-inset*unit[i] for i in range(2)]
        dot = m.Dot([*start,0], radius=.10, color=color)
        self.add(dot)
        self.show(dot.animate.move_to([*end,0]), seconds=seconds)
        self.remove(dot)

    def backprop(self, f):
        v,g,c = f['values'],f['gradients'],f['qContributions']
        points = {'x':(-5.5,1.5),'w':(-5.5,-.5),'q':(-2.7,.5),
                  'square':(0,1.7),'direct':(0,-.7),'p':(2.8,.5),'L':(5.5,.5)}
        colors={'x':BLUE,'w':BLUE,'q':BLUE,'square':GOLD,'direct':PURPLE,'p':GREEN,'L':INK}
        node_names={'x':f"x={v['x']}",'w':f"w={v['w']}",'q':f"q={v['q']}",
                    'square':r'q^2','direct':'q','p':f"p={v['p']}",'L':f"L={v['loss']}"}
        nodes={k:m.VGroup(m.Circle(radius=.61,color=colors[k],stroke_width=2).move_to([*p,0]),
                          formula(node_names[k],*p,size=30,color=colors[k])) for k,p in points.items()}
        routes=[('x','q'),('w','q'),('q','square'),('q','direct'),('square','p'),('direct','p'),('p','L')]
        links=m.VGroup(*(m.Arrow([*points[a],0],[*points[b],0],buff=.65,color=MUTED,stroke_width=2) for a,b in routes))
        self.show(m.Create(links),*(m.FadeIn(n) for n in nodes.values()),seconds=1.2)
        for a,b in routes:
            self.pulse(points[a],points[b],colors[a],seconds=.65)
        rule=formula(r'p=q^2+q',x=-2.8,y=3.1,size=40)
        loss_rule=formula(r'L=(p-2)^2/2',x=3,y=3.1,size=40)
        self.show(m.FadeIn(rule),m.FadeIn(loss_rule))
        self.until(12)
        question=formula('?',x=-2.7,y=2.6,size=54,color=BLUE)
        self.show(m.FadeIn(question),m.Indicate(nodes['q'],color=BLUE))
        self.until(18)
        gradient_mode=formula(r'\nabla L',x=-2.8,y=3.1,size=43,color=GREEN)
        self.show(m.FadeOut(question),m.ReplacementTransform(rule,gradient_mode))
        incoming=formula(rf'\partial L/\partial p={g["p"]}',x=4.1,y=1.65,size=30,color=GREEN)
        self.show(m.FadeIn(incoming))
        self.pulse(points['L'],points['p'],GREEN)
        terms=[]
        for branch,color,key,factor in [('square',GOLD,'square',2*v['q']),('direct',PURPLE,'identity',1)]:
            self.pulse(points['p'],points[branch],color)
            multiplier=formula(rf'\times{number(factor)}',x=1.3,y=1.95 if key=='square' else -1.45,size=35,color=color)
            self.show(m.FadeIn(multiplier))
            self.pulse(points[branch],points['q'],color)
            endpoint=formula(str(c[key]),x=-3.7,y=1.7 if key=='square' else -.75,size=40,color=color)
            self.show(m.FadeIn(endpoint))
            terms.append(endpoint)
        self.until(32)
        total=formula(rf'\frac{{\partial L}}{{\partial q}}={c["square"]}+{c["identity"]}={g["q"]}',y=3.0,size=49,color=GREEN)
        self.show(m.FadeOut(gradient_mode),m.FadeOut(loss_rule),m.FadeIn(total),
                  *(term.animate.move_to([-2.7,.5,0]) for term in terms),seconds=1)
        self.show(*(m.FadeOut(t) for t in terms))
        for name in ['x','w']:
            self.pulse(points['q'],points[name],BLUE)
            self.show(m.FadeIn(formula(rf'\partial L/\partial {name}={g[name]}',x=-5.3,y=2.5 if name=='x' else -1.5,size=30,color=GREEN)))
        self.until(44)

    def descent(self,f):
        scale=.83
        def p(v):return [-.6+scale*v[0],.55+scale*v[1],0]
        contours=m.VGroup(*(m.Line(p(a),p(b),color='#354250',stroke_width=2)
                            for line in f['contours'] for a,b in zip(line['points'],line['points'][1:])))
        axes=m.VGroup(m.Line(p([-4.6,0]),p([4.6,0]),color=MUTED,stroke_width=2),
                       m.Line(p([0,-2]),p([0,2]),color=MUTED,stroke_width=2),
                       formula('x',x=3.6,y=.5,size=35),formula('y',x=-.6,y=2.5,size=35),
                       formula('-4',x=p([-4,0])[0],y=-1.5,size=28,color=MUTED),
                       formula('4',x=p([4,0])[0],y=-1.5,size=28,color=MUTED),
                       formula('2',x=-1,y=p([0,2])[1],size=28,color=MUTED))
        rule=formula(r'L=(x^2+8y^2)/2',y=3.25,size=44)
        eta=formula(r'\eta=0.12',x=5,y=1.9,size=43,color=BLUE)
        start=m.Dot(p(f['start']),radius=.10,color=INK)
        self.show(m.Create(contours),m.Create(axes),m.FadeIn(rule),m.FadeIn(start),seconds=1.4)
        self.until(10)
        self.show(m.FadeIn(eta))
        question=formula('?',x=5,y=.8,size=55,color=BLUE)
        self.show(m.FadeIn(question))
        self.until(18)
        self.show(m.FadeOut(question))
        first=f['tracks']['sgd'][1]
        line=m.Line(p(f['start']),p(first['params']),color=BLUE,stroke_width=5)
        self.show(m.Create(line),start.animate.move_to(p(first['params'])),seconds=1.6)
        first_label=formula(rf'y_1={number(first["params"][1])}',x=5,y=.8,size=43,color=BLUE)
        self.show(m.FadeIn(first_label))
        self.until(28)
        self.remove(start,line,first_label)
        colors=[BLUE,GOLD,PURPLE]
        kinds=['sgd','momentum','adam']
        dots=[m.Dot(p(f['start']),radius=.085,color=c) for c in colors]
        self.add(*dots)
        legend=m.VGroup(*(text(name,5,1.65-j*.8,32,c) for j,(name,c) in enumerate(zip(['SGD','Momentum','Adam'],colors))))
        self.show(m.FadeIn(legend),m.FadeOut(eta))
        for step in range(1,21):
            self.show(*(m.Create(m.Line(p(f['tracks'][k][step-1]['params']),p(f['tracks'][k][step]['params']),color=c,stroke_width=3)) for k,c in zip(kinds,colors)),
                      *(d.animate.move_to(p(f['tracks'][k][step]['params'])) for d,k in zip(dots,kinds)),seconds=.45)
        self.until(42)
        probe=formula(r'\eta\;?',x=5,y=-1.1,size=48,color=BLUE)
        self.show(m.FadeIn(probe))
        self.until(50)

    def rope(self,f):
        origins=[(-3.1,.35),(3.1,.35)]
        queries,keys=[],[]
        for i,(ox,oy) in enumerate(origins):
            def p(v):return [ox+1.6*v[0],oy+1.6*v[1],0]
            axes=m.VGroup(m.Arrow(p([-1.4,0]),p([1.4,0]),buff=0,color=MUTED,stroke_width=2),
                           m.Arrow(p([0,-1.25]),p([0,1.5]),buff=0,color=MUTED,stroke_width=2),
                           formula(f'c_{i*2}',ox+2.55,oy,size=29,color=MUTED),
                           formula(f'c_{i*2+1}',ox-.38,oy+2.55,size=29,color=MUTED),
                           m.Circle(radius=1.6*math.hypot(*f['q'][i*2:i*2+2]),color='#354250',stroke_width=1).move_to([ox,oy,0]))
            q=m.Arrow([ox,oy,0],p(f['q'][i*2:i*2+2]),buff=0,color=BLUE,stroke_width=6)
            k=m.Arrow([ox,oy,0],p(f['k'][i*2:i*2+2]),buff=0,color=GOLD,stroke_width=6)
            self.show(m.Create(axes),m.Create(q),m.Create(k))
            queries.append(q);keys.append(k)
        step=formula(r'p_Q=p_K=0',y=3.1,size=46)
        self.show(m.FadeIn(step))
        self.until(8)
        self.show(m.FadeOut(step),seconds=.4)
        self.show(*(m.Rotate(q,f['rotationAngles']['initialQ']*freq,about_point=[*o,0]) for q,freq,o in zip(queries,f['pairFrequencies'],origins)),
                  *(m.Rotate(k,f['rotationAngles']['initialK']*freq,about_point=[*o,0]) for k,freq,o in zip(keys,f['pairFrequencies'],origins)),seconds=2.8)
        step=formula(r'p_Q=1,\quad p_K=3',y=3.1,size=46)
        self.show(m.FadeIn(step),seconds=.4)
        result=formula(rf"Q'\cdot K'={f['initial']['dot']:.3f}",y=-.0,size=43,color=GREEN)
        # The sum across both coordinate pairs is placed between the two plots.
        result.move_to([0,2.45,0])
        self.show(m.FadeIn(result))
        self.until(18)
        question=formula(r'p_Q+2,\quad p_K+2\quad?',y=3.1,size=46,color=BLUE)
        self.show(m.ReplacementTransform(step,question))
        self.until(26)
        self.show(*(m.Rotate(q,2*freq,about_point=[*o,0]) for q,freq,o in zip(queries,f['pairFrequencies'],origins)),
                  *(m.Rotate(k,2*freq,about_point=[*o,0]) for k,freq,o in zip(keys,f['pairFrequencies'],origins)),seconds=3)
        shifted=formula(r'p_Q=3,\quad p_K=5',y=3.1,size=46)
        self.show(m.ReplacementTransform(question,shifted))
        self.until(38)
        self.show(*(m.Rotate(k,2*freq,about_point=[*o,0]) for k,freq,o in zip(keys,f['pairFrequencies'],origins)),seconds=2.8)
        changed=formula(rf"Q'\cdot K'={f['changed']['dot']:.3f}",y=2.45,size=43,color=GREEN)
        positions=formula(r'p_Q=3,\quad p_K=7',y=3.1,size=46)
        self.show(m.ReplacementTransform(result,changed),m.ReplacementTransform(shifted,positions))
        self.until(46)
        self.show(m.Indicate(keys[0],color=GOLD),m.Indicate(keys[1],color=GOLD))
        self.until(50)

    def heads(self,f):
        modes=f['modes']; cols=[-4.8,-1.6,1.6,4.8]
        def query_nodes():
            return m.VGroup(*(m.VGroup(m.Circle(radius=.38,color=BLUE).move_to([x,1.8,0]),
                                      formula(f'q_{i}',x,1.8,size=34,color=BLUE)) for i,x in enumerate(cols)))
        def routes(mode):
            centers=cols if mode['kvHeads']==4 else [-3.2,3.2] if mode['kvHeads']==2 else [0]
            return m.VGroup(*(m.Arrow([centers[group],.8,0],[x,1.4,0],buff=.08,color=GOLD,stroke_width=3)
                              for x,group in zip(cols,mode['groups'])),
                            *(m.VGroup(m.Rectangle(width=1.4,height=.55,color=GOLD).move_to([x,.5,0]),
                                       formula(f'KV_{i}',x,.5,size=31,color=GOLD)) for i,x in enumerate(centers)))
        def bars(values,positions,y=-.7):
            return m.VGroup(*(m.Line([x,y,0],[x,y+.7*v if abs(v)>.001 else y+.001,0],color=GREEN,stroke_width=14)
                              for x,v in zip(positions,values)))
        q=query_nodes(); links=routes(modes[0]); title=formula('MHA',y=3.1,size=47)
        self.show(m.FadeIn(q),m.Create(links),m.FadeIn(title),seconds=1.2)
        pairs=[bars(v,[x-.25,x+.25]) for x,v in zip(cols,modes[0]['headOutputs'])]
        for pair in pairs:self.show(m.Create(pair),seconds=.6)
        self.until(8)
        concat_positions=[-4.8+i*1.35 for i in range(8)]
        joined=bars(modes[0]['concatenated'],concat_positions,y=.2)
        self.show(m.FadeOut(q),m.FadeOut(links),m.FadeOut(title),seconds=.5)
        for i,pair in enumerate(pairs):
            target=bars(modes[0]['headOutputs'][i],concat_positions[2*i:2*i+2],y=.2)
            self.show(m.ReplacementTransform(pair,target),seconds=.6)
            if i==0:joined=m.VGroup(target)
            else:joined.add(target)
        concat=formula(r'[o_0\mid o_1\mid o_2\mid o_3]\in\mathbb R^8',y=2.6,size=47)
        self.show(m.FadeIn(concat))
        self.until(18)
        output=bars(modes[0]['output'],[-3,-1,1,3],y=-.8)
        projection=formula(r'W^O:\;8\to4',x=4.7,y=1.6,size=45,color=GOLD)
        self.show(m.FadeIn(projection))
        for j in range(4):
            for i in range(8):
                if f['outputProjection'][i][j]:
                    self.pulse((concat_positions[i],.2),([-3,-1,1,3][j],-.8),GOLD,seconds=.22)
        self.show(m.Create(output),seconds=1)
        self.until(26)
        self.show(m.FadeOut(joined),m.FadeOut(concat),m.FadeOut(output),m.FadeOut(projection),seconds=.5)
        q=query_nodes(); links=routes(modes[0]); mode_title=formula('MHA\;\longrightarrow\;?',y=3.1,size=47)
        self.show(m.FadeIn(q),m.Create(links),m.FadeIn(mode_title))
        self.until(32)
        new=routes(modes[1])
        gqa_title=formula('GQA',y=3.1,size=47)
        self.show(m.FadeOut(links),m.FadeIn(new),m.ReplacementTransform(mode_title,gqa_title),seconds=1.5)
        links=new
        self.until(36)
        new=routes(modes[2]); self.show(m.FadeOut(links),m.FadeIn(new),
                                      m.ReplacementTransform(gqa_title,formula('MQA',y=3.1,size=47)),seconds=1.5)
        self.until(40)
        # Unequal distributions for two heads that share exactly the same K/V.
        wrows=[]
        for j,color in enumerate([BLUE,GOLD]):
            y=-.8-j*.62
            wrows.append(m.VGroup(*(m.Line([-4+i*3,y,0],[-4+i*3+2.5*w,y,0],color=color,stroke_width=10)
                                    for i,w in enumerate(modes[2]['weights'][j])),
                                  formula(f'a_{j}',x=-5.4,y=y,size=32,color=color)))
        self.show(*(m.Create(r) for r in wrows))
        self.until(46)
        self.show(m.Indicate(q[0],color=BLUE),m.Indicate(q[1],color=GOLD))
        self.until(50)

    def generation(self,f):
        before,after=f['steps'][2],f['steps'][3]
        assert after['keys'][:3]==before['keys'] and after['values'][:3]==before['values']
        def cache_row(index,state,color=GOLD):
            y=1.7-index*.85
            group=m.VGroup(formula(str(index),x=-3.9,y=y,size=28,color=MUTED))
            for cx,key in [(-1.8,'keys'),(1.5,'values')]:
                for dim,value in enumerate(state[key][index]):
                    yy=y+.14-dim*.28
                    group.add(m.Line([cx,yy,0],[cx+.8*value if abs(value)>.001 else cx+.001,yy,0],color=color,stroke_width=8),
                              m.Dot([cx,yy,0],radius=.025,color=MUTED))
            return group
        headers=m.VGroup(formula('K',x=-1.6,y=2.65,size=43,color=GOLD),formula('V',x=1.7,y=2.65,size=43,color=PURPLE),
                          formula('t',x=-4,y=2.65,size=30,color=MUTED))
        rows=[cache_row(i,before) for i in range(3)]
        self.show(m.FadeIn(headers))
        for i,row in enumerate(rows):
            self.show(m.Create(row),seconds=.7)
        self.until(8)
        fence=m.Rectangle(width=8.1,height=2.55,color=MUTED,stroke_width=2).move_to([-.35,.85,0])
        self.show(m.Create(fence))
        self.until(18)
        source=m.VGroup(m.Circle(radius=.48,color=BLUE).move_to([-5.5,1.8,0]),formula('x_3',x=-5.5,y=1.8,size=36,color=BLUE))
        unknown=formula('?',x=-.3,y=-.9,size=54,color=BLUE)
        self.show(m.FadeIn(source),m.FadeIn(unknown))
        self.until(26)
        self.show(m.FadeOut(unknown))
        self.pulse((-5.5,1.8),(-2,-.85),BLUE,seconds=1.3)
        appended=cache_row(3,after,GREEN)
        self.show(m.Create(appended),seconds=1.2)
        self.until(36)
        q=formula('q_3',x=5.3,y=1.8,size=42,color=BLUE)
        self.show(m.FadeIn(q))
        streams=m.VGroup(*(m.Arrow([2.8,1.7-i*.85,0],[5.2,.6,0],buff=.12,color=PURPLE,
                                   stroke_width=1+10*w) for i,w in enumerate(after['weights'])))
        self.show(m.Create(streams),seconds=1.2)
        output=formula(rf"o=({number(after['output'][0])},{number(after['output'][1])})",x=4.7,y=-1.2,size=32,color=GREEN)
        equality=formula(r'o_{cache}=o_{full}',x=4.5,y=2.7,size=32,color=GREEN)
        self.show(m.FadeIn(output),m.FadeIn(equality))
        self.until(46)
        self.show(m.Indicate(rows[1],color=BLUE))
        self.until(50)

    def xor(self,f):
        def field(cx,grid=None):
            def p(v):return [cx+(v[0]-.5)*2.9,.65+(v[1]-.5)*2.9,0]
            group=m.VGroup()
            if grid:
                for row in grid:
                    for cell in row:
                        prob=cell['probability']; color=GOLD if prob>=.5 else BLUE
                        group.add(m.Rectangle(width=2.9/14+.005,height=2.9/14+.005,stroke_width=0,fill_color=color,
                                              fill_opacity=.12+.58*abs(2*prob-1)).move_to(p(cell['input'])))
            for sample in f['data']:
                color=GOLD if sample['target'] else BLUE
                group.add(m.Circle(radius=.20,color=color,fill_color='#0B0E14',fill_opacity=1).move_to(p(sample['input'])),
                          formula(str(sample['target']),*p(sample['input'])[:2],size=27,color=color))
            group.add(m.Line(p([-.12,-.12]),p([1.12,-.12]),color=MUTED,stroke_width=2),
                      m.Line(p([-.12,-.12]),p([-.12,1.12]),color=MUTED,stroke_width=2),
                      formula('x_1',cx+2.05,-1.15,size=31,color=MUTED),
                      formula('x_2',cx-2.05,2.4,size=31,color=MUTED))
            return group
        targets=field(0)
        self.show(m.Create(targets),seconds=1.2)
        self.until(10)
        separator=m.Line([-1.65,-.2,0],[1.65,1.5,0],color=INK,stroke_width=3)
        question=formula('?',x=3.5,y=1,size=54,color=GOLD)
        self.show(m.Create(separator),m.FadeIn(question))
        self.show(m.Rotate(separator,.6,about_point=[0,.65,0]),seconds=2)
        self.until(18)
        self.show(m.FadeOut(separator),m.FadeOut(question),m.FadeOut(targets))
        input_node=(-5,1); output_node=(5,1)
        positions=[(-1.2,2.2),(-1.2,1.2),(-1.2,.2),(-1.2,-.8)]
        links=m.VGroup(*(arrow(input_node,p,MUTED) for p in positions),*(arrow(p,output_node,MUTED) for p in positions))
        nodes=m.VGroup(*(m.Circle(radius=.30,color=[BLUE,GOLD,PURPLE,GREEN][i],fill_color=[BLUE,GOLD,PURPLE,GREEN][i],
                                  fill_opacity=.15+.5*abs(h['activation'])).move_to([*p,0])
                         for i,(p,h) in enumerate(zip(positions,f['trace']['hidden']))))
        sample=formula('(0,1)',x=input_node[0],y=input_node[1]+.7,size=39)
        self.show(m.Create(links),m.FadeIn(nodes),m.FadeIn(sample))
        for i,p in enumerate(positions):
            self.pulse(input_node,p,[BLUE,GOLD,PURPLE,GREEN][i],seconds=.35)
            self.pulse(p,output_node,[BLUE,GOLD,PURPLE,GREEN][i],seconds=.35)
        probability=formula(rf"p={f['trace']['probability']:.3f}",*output_node,size=40,color=GREEN)
        self.show(m.FadeIn(probability))
        self.until(28)
        self.show(m.FadeOut(links),m.FadeOut(nodes),m.FadeOut(sample),m.FadeOut(probability))
        first,last=field(-3.4,f['initial']['grid']),field(3.4,f['final']['grid'])
        labels=m.VGroup(formula(rf"L_0={f['initial']['loss']:.3f}",x=-3.4,y=3.05,size=40),
                         formula(rf"L_{{1000}}={f['final']['loss']:.3f}",x=3.4,y=3.05,size=40,color=GREEN))
        self.show(m.Create(first),m.Create(last),m.FadeIn(labels),seconds=1.4)
        self.until(42)
        self.show(m.Indicate(last,color=GREEN),seconds=1)
        self.until(50)
