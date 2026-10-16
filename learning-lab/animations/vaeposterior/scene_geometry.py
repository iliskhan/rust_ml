"""Silent causal films. Model results are read from exported TS fixtures only.

Screen coordinates, lengths, colors and linear interpolation are drawing operations;
no model is trained, sampled or solved here. Labels never morph into geometry.
"""
import math
import manimgx as m
from topic_scene import text, INK, MUTED, BLUE, GOLD, GREEN, PURPLE


def eq(s, x=0, y=3.05, size=47, color=INK):
    return m.MathTex(s, font_size=size, color=color).move_to([x, y, 0])


def dot(p, color=BLUE, radius=.09):
    return m.Dot(p, radius=radius, color=color)


def segment(a, b, color=BLUE, width=4):
    # Degenerate scalar terms remain a point, never a fabricated nonzero vector.
    return m.Line(a, b, color=color, stroke_width=width) if a != b else dot(a, color, .025)


class Film:
    def __init__(self, scene, formula):
        self.s, self.t = scene, 0
        scene.add(eq(formula))

    def play(self, *animations, seconds=.7):
        self.s.play(*animations, run_time=seconds)
        self.t += seconds

    def at(self, time):
        assert self.t <= time + 1e-8, (self.t, time)
        if self.t < time:
            self.s.wait(time-self.t)
            self.t = time

    def predict(self, parameter, x=4.8, y=2.1):
        self.at(6)
        self.question = eq(parameter+r'\;?', x, y, 40, GOLD)
        self.play(m.FadeIn(self.question), seconds=.5)
        self.at(12)
        self.play(m.FadeOut(self.question), seconds=.3)

    def finish(self, parameter, x=4.8, y=2.1):
        self.at(34)
        self.play(m.FadeIn(eq(parameter+r'\;?', x, y, 40, GOLD)), seconds=.5)
        self.at(40)


def scalar_axis(lo, hi, y=0, x0=-5, x1=5, name='x'):
    pad = max((hi-lo)*.08, .05)
    lo, hi = lo-pad, hi+pad
    def point(v, height=y):
        return [x0+(x1-x0)*(v-lo)/(hi-lo), height, 0]
    axis = m.VGroup(segment([x0, y, 0], [x1, y, 0], MUTED, 2),
                    eq(f'{lo:.2f}', x0, y-.38, 28, MUTED),
                    eq(f'{hi:.2f}', x1, y-.38, 28, MUTED),
                    eq(name, x1+.55, y, 34, MUTED))
    return axis, point


def plot_axes(points, xlabel='x', ylabel='y'):
    xs, ys = [p['x'] for p in points], [p['y'] for p in points]
    lo, hi = min(xs), max(xs)
    bottom, top = min(0, min(ys)), max(ys)
    margin = max(.08, (top-bottom)*.12)
    bottom, top = bottom-margin, top+margin
    def point(p):
        return [-4.9+9.8*(p['x']-lo)/max(hi-lo, .01),
                -1+2.8*(p['y']-bottom)/(top-bottom), 0]
    axes = m.VGroup(segment([-4.9, -1, 0], [4.9, -1, 0], MUTED, 2),
                     segment([-4.9, -1, 0], [-4.9, 1.8, 0], MUTED, 2),
                     eq(f'{lo:.2f}', -4.9, -1.38, 28, MUTED),
                     eq(f'{hi:.2f}', 4.9, -1.38, 28, MUTED),
                     eq(f'{bottom:.2f}', -5.65, -1, 28, MUTED),
                     eq(f'{top:.2f}', -5.65, 1.8, 28, MUTED),
                     eq(xlabel, 5.5, -.98, 34, MUTED), eq(ylabel, -4.8, 2.25, 34, MUTED))
    return axes, point


def curve(points, point, color=BLUE, width=4):
    return m.VGroup(*(segment(point(a), point(b), color, width) for a, b in zip(points, points[1:])))


def posterior(scene, f):
    c = Film(scene, r'z=\mu+\sigma\varepsilon')
    axes, p = plot_axes(f['before'], 'z', r'q(z\mid x)')
    bell = curve(f['before'], p)
    particle = dot(p(f['markers'][0]), GOLD, .12)
    mu = p({'x': f['trace']['mu'], 'y': 0})
    center = segment(mu, [mu[0], 1.9, 0], MUTED, 2)
    c.play(m.Create(axes), m.Create(bell), m.Create(center), m.FadeIn(particle), seconds=2)
    fixed = eq(r'\mu='+f"{f['trace']['mu']:.2f}"+r',\quad\sigma='+f"{f['trace']['sd']:.2f}", 1.9, 2.2, 34)
    scene.add(fixed)
    c.predict(r'\varepsilon', 4.8, 1.5)
    old = dot(p(f['markers'][0]), MUTED, .065)
    scene.add(old)
    selected_path=[f['markers'][0]]+[v for v in f['before'] if f['markers'][0]['x']<v['x']<f['markers'][1]['x']]+[f['markers'][1]]
    def slide(path,seconds):
        for target in path[1:]:
            c.play(particle.animate.move_to(p(target)),seconds=seconds/(len(path)-1))
    # Follow the exported density polyline, not the chord between samples.
    slide(selected_path,4)
    epsilon = eq(r'\varepsilon:0.5\to1.5', -1.65, 2.2, 35, GOLD)
    c.play(m.FadeIn(epsilon))
    c.at(26)
    # Same distribution and encoder parameters; only the selected sample moves.
    slide(list(reversed(selected_path)),2)
    slide(selected_path,2)
    c.finish(r'\varepsilon', 4.8, 1.5)


def elbo(scene, f):
    c = Film(scene, r'-\mathrm{ELBO}=\mathbb E_q[\mathrm{NLL}]+\mathrm{KL}')
    limit = max(f['before']+f['after']+[f['marginal']])*1.1
    axes, p = scalar_axis(0, limit, -.8, name=r'\mathrm{nat}')
    scene.add(axes)
    def pieces(values, y):
        a, b = values[:2]
        return segment(p(0,y),p(a,y),BLUE,20), segment(p(a,y),p(a+b,y),GOLD,20)
    first = pieces(f['before'], .25)
    c.play(*(m.Create(o) for o in first), m.FadeIn(eq(r'\varepsilon=0.5', -3.5, .85, 32)), seconds=2)
    c.predict(r'\mathbb E_q')
    second = pieces(f['after'], 1.65)
    c.play(m.Create(second[0]), seconds=2)
    token = dot(p(f['after'][0], 1.65), GOLD, .11)
    c.play(m.FadeIn(token), seconds=.3)
    c.play(token.animate.move_to(p(f['after'][2], 1.65)), m.Create(second[1]), seconds=2)
    c.play(m.FadeIn(eq(r'\mathbb E_q', -4.7, 2.2, 32)), seconds=.5)
    c.at(26)
    marginal = p(f['marginal'], -.8)
    bound = p(f['after'][2], -.8)
    c.play(m.Create(segment([marginal[0],-.9,0],[marginal[0],1.9,0],GREEN,2)),
           m.Create(segment(bound,[bound[0],1.9,0],GOLD,2)),
           m.FadeIn(eq(r'-\log p(x)', marginal[0], -1.4, 31, GREEN)), seconds=1.5)
    c.finish(r'\varepsilon', 4.8, 2.2)


def parameter_bank(values, next_values, y0, span, color):
    scale = span/max(.01, *(abs(v) for v in values+next_values))
    xs = [-4.6+9.2*i/max(1,len(values)-1) for i in range(len(values))]
    starts = [[x,y0+scale*v,0] for x,v in zip(xs,values)]
    ends = [[x,y0+scale*v,0] for x,v in zip(xs,next_values)]
    axes = m.VGroup(*(segment([x,y0-span,0],[x,y0+span,0],MUTED,1) for x in xs))
    particles = [dot(p,color,.075) for p in starts]
    return axes, particles, starts, ends


def weights(scene, f):
    alternating = f['slug']=='gantraining'
    c = Film(scene, r'\theta\leftarrow\theta-\eta\nabla_\theta L')
    if alternating:
        model, ds, gs = f['inputs']['model'], f['dStep']['state'], f['gStep']['state']
        banks = [parameter_bank(model['discriminator'], ds['discriminator'], 1.4,.45,GOLD),
                 parameter_bank(model['generator'], gs['generator'], -.3,.45,BLUE)]
        scene.add(eq('D',-5.5,1.4,40,GOLD),eq('G',-5.5,-.3,40,BLUE))
    else:
        banks = [parameter_bank(f['before'], f['after'], .5,1.1,BLUE)]
        scene.add(*(text(n,x,-1.25,29,MUTED) for n,x in zip(f['labels'],[-4.6+9.2*i/5 for i in range(6)])))
    for axes, particles, starts, ends in banks:
        scene.add(axes,*particles,*(dot(p,MUTED,.035) for p in starts))
    c.predict(r'\eta')
    for index, (axes, particles, starts, ends) in enumerate(banks):
        trails = m.VGroup(*(segment(a,b,GREEN,3) for a,b in zip(starts,ends)))
        c.play(m.Create(trails),*(particle.animate.move_to(end) for particle,end in zip(particles,ends)),seconds=3.5)
        if alternating and index==0:
            c.at(19)
    c.at(26)
    for axes, particles, starts, ends in banks:
        # Visual measurement of the exported update, never invented optimizer steps.
        c.play(*(m.FadeIn(m.Circle(radius=.14,color=GREEN).move_to(p)) for p in ends),seconds=.7)
    c.finish(r'\eta')


def network(scene, f):
    c = Film(scene, r'z\longrightarrow G(z)\longrightarrow D(G(z))')
    ys = [1.8,1,.2,-.6]
    input_p, middle, output_p = [-5.3,.6,0],[-.8,.6,0],[5.1,.6,0]
    gh, dh = [[-3,y,0] for y in ys],[[2.1,y,0] for y in ys]
    edges = [(input_p,p) for p in gh]+[(p,middle) for p in gh]+[(middle,p) for p in dh]+[(p,output_p) for p in dh]
    scene.add(*(m.Line(a,b,buff=.24,color=MUTED,stroke_width=2) for a,b in edges))
    for i,p in enumerate([input_p,*gh,middle,*dh,output_p]):
        scene.add(m.Circle(radius=.22,color=BLUE if i<6 else GOLD).move_to(p))
    scene.add(eq('G',-3,2.35,39,BLUE),eq('D',2.1,2.35,39,GOLD),eq('0.5',-5.3,-.1,32))
    initial = dot(input_p,BLUE,.12)
    c.play(m.FadeIn(initial))
    c.predict(r'\theta')
    def propagate(start, hidden, end, values, color):
        packets = [dot(start,color,.07+.04*abs(v)) for v in values]
        scene.add(*packets)
        c.play(*(p.animate.move_to(q) for p,q in zip(packets,hidden)),seconds=2)
        c.play(*(p.animate.move_to(end) for p in packets),seconds=2)
        scene.remove(*packets)
        scene.add(dot(end,color,.12))
    propagate(input_p,gh,middle,f['generated']['hidden'],BLUE)
    c.play(m.FadeIn(eq(f"{f['generated']['output']:.3f}",-.8,-.15,32,BLUE)))
    propagate(middle,dh,output_p,f['judged']['hidden'],GOLD)
    c.play(m.FadeIn(eq(f"{f['score']:.3f}",5.1,-.15,32,GOLD)))
    c.at(26)
    scene.add(eq(r'\theta_G,\theta_D=\mathrm{const}',0,-1.3,34,MUTED))
    c.finish('z')


def transport(scene, f):
    slug=f['slug']
    formula = {'vaegeneration':r'z\sim\mathcal N(0,1),\quad\mu_x=wz+b',
               'gandiversity':r'G_0(z)\quad\longleftrightarrow\quad G_{\rm collapse}(z)',
               'rlpolicy':r'g=(r-b)\nabla\log\pi'}[slug]
    c=Film(scene,formula)
    values=[p['x'] for p in f['before']+f['after']]
    axes,p=scalar_axis(min(values),max(values),-.9,name='g' if slug=='rlpolicy' else 'x')
    scene.add(axes)
    high,low=1.6,.1
    scene.add(segment([-5,high,0],[5,high,0],MUTED,1))
    labels={'vaegeneration':('z',r'\mu_x'),'gandiversity':('G_0',r'G_{\rm collapse}'),'rlpolicy':('b=0','b=0.3')}
    scene.add(eq(labels[slug][0],-5.7,high,38 if slug=='vaegeneration' else 30),eq(labels[slug][1],-5.7,low,30))
    # Small lanes separate sample identities, not extra model dimensions.
    starts=[p(a['x'],high+(i%3)*.09) for i,a in enumerate(f['before'])]
    ends=[p(a['x'],low+(i%3)*.09) for i,a in enumerate(f['after'])]
    particles=[dot(a,BLUE,.07) for a in starts]
    scene.add(*particles)
    c.predict('b' if slug=='rlpolicy' else 'z')
    scene.add(*(dot(a,MUTED,.035) for a in starts))
    connectors=m.VGroup(*(segment(a,b,MUTED,1) for a,b in zip(starts,ends)))
    c.play(m.Create(connectors),*(o.animate.move_to(b) for o,b in zip(particles,ends)),seconds=5)
    c.at(26)
    if slug=='rlpolicy':
        q=p(f['raw']['mean'])
        c.play(m.Create(segment([q[0],-.95,0],[q[0],2.05,0],GREEN,3)),
               m.FadeIn(eq('0.35',q[0],-1.45,32,GREEN)),seconds=1.5)
    else:
        c.play(*(o.animate.set_color(GOLD) for o in particles),seconds=1)
    c.finish('b' if slug=='rlpolicy' else 'z')


def gradients(scene,f):
    c=Film(scene,r'\partial L_G/\partial\ell_D')
    axes,p=scalar_axis(-1,0,.5,name=r'\partial L')
    previous_logit=eq(r'\ell_D=-5',-3,2.1,37)
    scene.add(axes,previous_logit)
    labels=['non-sat','minimax']
    heights=[1.3,-.35]
    particles=[]
    previous_segments=[]
    for v,y,name,col in zip(f['before'],heights,labels,[BLUE,GOLD]):
        scene.add(text(name,-5.3,y,28,col))
        q=dot(p(v,y),col,.12)
        particles.append(q)
        previous_segment=segment(p(0,y),p(v,y),col,5)
        previous_segments.append(previous_segment)
        c.play(m.FadeIn(q),m.Create(previous_segment))
    c.predict(r'\ell_D')
    previous_logit.set_color(MUTED)
    for previous_segment in previous_segments:previous_segment.set_color(MUTED)
    for q,v,y,col in zip(particles,f['after'],heights,[BLUE,GOLD]):
        c.play(q.animate.move_to(p(v,y)),m.Create(segment(p(0,y),p(v,y),col,2)),seconds=2)
    c.play(m.FadeIn(eq(r'\ell_D=-2',1.5,2.1,37)))
    c.at(26)
    scene.add(eq(f"{f['after'][0]:.3f}",-3,-1.3,32,BLUE),eq(f"{f['after'][1]:.3f}",2,-1.3,32,GOLD))
    c.finish(r'\ell_D')


def diffusion(scene,f):
    slug=f['slug']
    if slug=='diffusionsampling':
        c=Film(scene,r'\mathrm{DDPM}\qquad\mathrm{DDIM}\ (\eta=0)')
        axes,p=plot_axes(f['before']+f['after'],'t','x_t')
        scene.add(axes)
        first=dot(p(f['before'][0]),BLUE,.11)
        second=dot(p(f['after'][0]),GOLD,.09)
        scene.add(first,second)
        c.predict(r'\Delta t')
        # Trace the actual exported path in order, never a straight endpoint morph.
        for points,particle,color,duration in [(f['before'],first,BLUE,6),(f['after'],second,GOLD,6)]:
            for a,b in zip(points,points[1:]):
                c.play(m.Create(segment(p(a),p(b),color,3)),particle.animate.move_to(p(b)),seconds=duration/(len(points)-1))
        c.at(26)
        scene.add(eq('64',-2,2.2,35,BLUE),eq('16',2,2.2,35,GOLD))
        c.finish(r'\Delta t')
        return
    if slug=='diffusiontraining':
        c=Film(scene,r'L=\mathbb E(\varepsilon_\theta-\varepsilon)^2')
        axes,p=plot_axes(f['before']+f['after'],'x_t',r'\varepsilon_\theta')
        scene.add(axes)
        old=curve(f['before'],p,MUTED,2)
        current=curve(f['before'],p,BLUE,4)
        scene.add(old,current,eq('t=20',3.6,2.25,34))
        c.predict(r'\theta')
        # Every segment has the same exported x domain; only predicted epsilon moves.
        targets=curve(f['after'],p,GOLD,4)
        c.play(*(m.Transform(a,b) for a,b in zip(current.submobjects,targets.submobjects)),seconds=5)
        c.at(26)
        scene.add(eq(rf"\mathrm{{MSE}}:{f['rows'][0][1]:.3f}\to{f['rows'][1][1]:.3f}",1,2.25,34,GOLD))
        c.finish(r'\theta')
        return
    if slug=='diffusionforward':
        c=Film(scene,r'x_t=\sqrt{\bar\alpha_t}x_0+\sqrt{1-\bar\alpha_t}\varepsilon')
        start=f['inputs']['x0']; signal=f['rows'][1][1]; target=f['xt']
        values=[0,start,signal,target]
        names=['x_0',r'\sqrt{\bar\alpha}x_0','x_{24}']
        transitions=[signal,target]
        formula_parameter=r'\varepsilon'
    elif slug=='diffusionreverse':
        c=Film(scene,r'x_{t-1}=\mu_\theta+\sqrt{\tilde\beta_t}z')
        start=f['xt']; signal=f['reverse']['mean']; target=f['reverse']['next']
        values=[0,start,f['reverse']['x0'],signal,target]
        names=['x_{24}',r'\mu_\theta','x_{23}']
        transitions=[signal,target]
        formula_parameter='z'
    else:
        c=Film(scene,r'\varepsilon_{\rm CFG}=\varepsilon_u+s(\varepsilon_c-\varepsilon_u)')
        start=f['guidance']['unconditional'];signal=f['guidance']['conditional'];target=f['guidanceMore']['guided']
        values=[0,start,signal,target]
        names=[r'\varepsilon_u',r'\varepsilon_c',r'\varepsilon_{s=2}']
        transitions=[signal,target]
        formula_parameter='s'
    axes,p=scalar_axis(min(values),max(values),-.7,name='x' if slug!='diffusionguidance' else r'\varepsilon')
    scene.add(axes)
    particle=dot(p(start,.4),BLUE,.13)
    scene.add(particle,eq(names[0],p(start)[0],1.05,35,BLUE))
    c.predict(formula_parameter)
    last=start
    for k,value in enumerate(transitions):
        y=.4
        c.play(m.Create(segment(p(last,y),p(value,y),GOLD if k else BLUE,5)),particle.animate.move_to(p(value,y)),seconds=3)
        scene.add(dot(p(value,y),GOLD,.07))
        c.play(m.FadeIn(eq(names[k+1],p(value)[0],1.65 if k==0 else .95,34,GOLD)))
        last=value
    c.at(26)
    if slug=='diffusionreverse':
        c.play(m.FadeIn(dot(p(f['deterministic']['next'],.4),GREEN,.1)),
               m.FadeIn(eq('z=0',p(signal)[0],-.12,30,GREEN)),seconds=1)
    elif slug=='diffusionguidance':
        scene.add(eq(r'\mathrm{oracle}',-3,2.2,30,MUTED))
    else:
        scene.add(eq('t=24',-3,2.2,34,MUTED))
    c.finish(formula_parameter)


GRAPH_LABEL_OFFSETS=[(-.45,0),(-.45,0),(0,.45),(0,.45),(.45,0),(.45,0)]


def graph_layout(scene,f):
    positions=[[-5.1,1.6,0],[-5.1,-.4,0],[-3.8,.6,0],[-2.3,.6,0],[-1,1.6,0],[-1,-.4,0]]
    adjacency=f.get('adjacency',f['inputs']['adjacency'])
    edges=m.VGroup(*(m.Line(positions[i],positions[j],buff=.25,color=MUTED,stroke_width=2)
                     for i,row in enumerate(adjacency) for j,v in enumerate(row) if v and j>i))
    nodes=[m.Circle(radius=.22,color=BLUE,fill_color=BLUE,fill_opacity=.15).move_to(p) for p in positions]
    names=[text(chr(65+i),p[0]+dx,p[1]+dy,27) for i,(p,(dx,dy)) in enumerate(zip(positions,GRAPH_LABEL_OFFSETS))]
    scene.add(edges,*nodes,*names)
    return positions,nodes,names


def graph_film(scene,f):
    slug=f['slug']
    formulas={'gnnadjacency':r'A_{ij}\in\{0,1\},\quad X_i\in\mathbb R^2',
              'gnnmessage':r'H_C=\sum_j S_{Cj}X_j',
              'gnntraining':r'L=-\sum_{i\in\mathcal T}\log p_i(y_i)',
              'gnndepth':r'H^{(k+1)}=SH^{(k)}',
              'gnnvariants':r'h_C=\sum_j a_{Cj}Wh_j'}
    c=Film(scene,formulas[slug])
    pos,nodes,names=graph_layout(scene,f)
    if slug=='gnnadjacency':
        cells={}
        for i,row in enumerate(f['adjacency']):
            for j,value in enumerate(row):
                cell=m.Rectangle(width=.4,height=.4,color=MUTED,stroke_width=1,
                                 fill_color=BLUE,fill_opacity=.8 if value else .03).move_to([1.3+.5*j,1.7-.5*i,0])
                cells[i,j]=cell
                scene.add(cell)
        scene.add(eq('A',2.6,2.35,38))
        c.predict('A_{Cj}')
        for j,edge in enumerate(f['adjacency'][2]):
            if edge:
                particle=dot(pos[j],GOLD,.10)
                scene.add(particle)
                c.play(particle.animate.move_to(pos[2]),cells[2,j].animate.set_fill(GOLD,opacity=1),seconds=1.3)
                scene.remove(particle)
        c.at(26)
        # The feature table is a separate object, not node layout coordinates.
        features=f['inputs']['features'][2]
        scene.add(eq(r'X_C=('+rf'{features[0]:.1f},\ {features[1]:.1f}'+')',1.8,-1.35,34,GREEN))
        c.finish('X_C')
    elif slug=='gnnmessage':
        contributions=[row[2] for row in f['rows']]
        total=f['graph']['aggregate'][2][0]
        extent=max(1,sum(abs(v) for v in contributions))
        axes,p=scalar_axis(-extent,extent,-.2,x0=.5,x1=5.2,name='H_{C,0}')
        scene.add(axes)
        result=dot(p(0),GREEN,.11)
        scene.add(result)
        c.predict('S_{Cj}')
        accumulated=0
        for j,(weight,value) in enumerate(zip(f['graph']['normalized'][2],contributions)):
            if weight==0: continue
            packet=dot(pos[j],GOLD,.07+.13*weight)
            scene.add(packet)
            c.play(packet.animate.move_to(pos[2]),seconds=.9)
            scene.remove(packet)
            previous=accumulated
            accumulated+=value
            c.play(m.Create(segment(p(previous),p(accumulated),BLUE if value>=0 else PURPLE,7)),
                   result.animate.move_to(p(accumulated)),seconds=.8)
        assert abs(accumulated-total)<1e-10
        c.at(26)
        scene.add(eq(f'{total:.3f}',p(total)[0],.55,38,GREEN),eq('C',pos[2][0],-.05,32,GOLD))
        c.finish('S_{Cj}')
    elif slug=='gnntraining':
        bars=[]
        for i,row in enumerate(f['before']):
            x,y=1.4,1.8-i*.48
            scene.add(text(chr(65+i),.6,y,26,MUTED),segment([x,y,0],[5,y,0],GOLD,15))
            bar=segment([x,y,0],[x+3.6*row[0],y,0],BLUE,15)
            bars.append(bar)
            scene.add(bar)
        loss=eq('L',-.3,-1.15,37,GREEN)
        scene.add(loss)
        c.predict(r'\mathcal T')
        # These particles represent loss contributions, not additional graph edges.
        packets=[dot(pos[i],GREEN,.09) for i in [0,2,3,5]]
        scene.add(*packets)
        c.play(*(o.animate.move_to([-.3,-1.15,0]) for o in packets),seconds=2.5)
        scene.remove(*packets)
        for i,(bar,row) in enumerate(zip(bars,f['after'])):
            target=segment([1.4,1.8-i*.48,0],[1.4+3.6*row[0],1.8-i*.48,0],BLUE,15)
            c.play(m.Transform(bar,target),seconds=.65)
        c.at(26)
        scene.add(eq(r'\mathrm{CE}:'+f"{f['rows'][0][1]:.3f}"+r'\to'+f"{f['rows'][1][1]:.3f}",2.9,-1.4,31,GREEN))
        c.finish(r'\eta')
    elif slug=='gnndepth':
        dispersions=f['smoothed']['dispersions']
        highest=max(dispersions)
        def dp(k):return [.6+4.7*k/30,-.9+2.5*dispersions[k]/highest,0]
        scene.add(segment([.6,-.9,0],[5.3,-.9,0],MUTED,2),
                  segment([.6,-.9,0],[.6,1.6,0],MUTED,2),eq('k',5.6,-.9,30,MUTED),
                  eq(r'\mathrm{Var}(H/\sqrt d)',3,2.05,31,MUTED))
        feature_scale=max(abs(v[0]) for row in f['smoothed']['history'] for v in row)
        for node,value in zip(nodes,f['smoothed']['history'][0]):
            node.set_fill(BLUE if value[0]>=0 else GOLD,opacity=.15+.75*abs(value[0])/feature_scale)
        c.predict(r'PAP^T')
        cursor=dot(dp(0),GOLD,.10)
        scene.add(cursor)
        for k in range(1,31):
            row=f['smoothed']['history'][k]
            c.play(*(node.animate.set_fill(BLUE if value[0]>=0 else GOLD,opacity=.15+.75*abs(value[0])/feature_scale)
                     for node,value in zip(nodes,row)),
                   m.Create(segment(dp(k-1),dp(k),GREEN,3)),cursor.animate.move_to(dp(k)),seconds=.28)
        c.at(26)
        # Relabel the same objects with inverse permutation; geometry is unchanged.
        replacement=[text(str(f['order'].index(i)),p[0]+dx,p[1]+dy,27)
                     for i,(p,(dx,dy)) in enumerate(zip(pos,GRAPH_LABEL_OFFSETS))]
        c.play(*(m.FadeOut(n) for n in names),*(m.FadeIn(n) for n in replacement),seconds=1.2)
        scene.add(eq(r'\|f(PAP^T,PX)-Pf(A,X)\|='+f"{f['permutation']['error']:.1e}",0,-1.45,28,GREEN))
        c.finish('k')
    else:
        attention=f['attention']; uniform=f['uniform']
        bars=[]
        for i,weight in enumerate(attention['attention']):
            y=1.7-i*.65
            scene.add(text(chr(65+attention['neighbors'][i]),.6,y,28,MUTED))
            bar=segment([1,y,0],[1+7*weight,y,0],BLUE,16)
            bars.append(bar);scene.add(bar)
        c.predict('a_{Cj}')
        packets=[dot(pos[j],GOLD,.07+.2*w) for j,w in zip(attention['neighbors'],attention['attention'])]
        scene.add(*packets)
        c.play(*(o.animate.move_to(pos[2]) for o in packets),seconds=3)
        scene.remove(*packets)
        output=eq(f"h_C={attention['output']:.3f}",2.8,-1.25,36,GREEN)
        scene.add(output)
        c.at(26)
        c.play(*(m.Transform(bar,segment([1,1.7-i*.65,0],[1+7*w,1.7-i*.65,0],GOLD,16))
                 for i,(bar,w) in enumerate(zip(bars,uniform['attention']))),seconds=2)
        c.play(m.FadeOut(output),m.FadeIn(eq(f"h_C={uniform['output']:.3f}",2.8,-1.25,36,GREEN)),seconds=.4)
        # Explicit four-slot concatenation; the first pair is self, the next mean-neighbor.
        scene.add(text('SAGE',-5.75,-1.2,25,MUTED))
        for i,value in enumerate(attention['concatenated']):
            col=BLUE if i<2 else GOLD
            scene.add(m.Rectangle(width=.9,height=.45,color=col).move_to([-4.7+i,-1.2,0]),
                      eq(f'{value:.2f}',-4.7+i,-1.2,25,col))
        c.finish('e_{Cj}=0')


def grid(scene):
    positions=[[-4.6+(i%4)*1.3,1.65-(i//4)*1.1,0] for i in range(12)]
    cells=[]
    for i,p in enumerate(positions):
        cell=m.Rectangle(width=1.15,height=.95,color=GREEN if i==3 else PURPLE if i==7 else MUTED,
                         fill_color=GREEN if i==3 else PURPLE if i==7 else BLUE,
                         fill_opacity=.3 if i in (3,7) else .03).move_to(p)
        cells.append(cell)
        scene.add(cell,text(str(i),p[0]-.38,p[1]+.28,22,MUTED))
    return positions,cells


def reinforcement(scene,f):
    slug=f['slug']
    if slug=='rlqlearning':
        c=Film(scene,r'Q\leftarrow Q+\alpha[r+\gamma\max Q(s^\prime)-Q]')
        old=f['inputs']['manualOld'];reward=f['inputs']['manualReward'];nextq=f['inputs']['manualNext']
        q=f['q'];terminal=f['terminal']
        axes,p=scalar_axis(min(reward,0),max(nextq,q['target']),-.6,name='Q')
        scene.add(axes)
        particle=dot(p(old,.4),BLUE,.13)
        scene.add(particle,dot(p(old,.4),MUTED,.05),eq('Q',p(old)[0],1.15,36,BLUE))
        c.predict(r'\mathrm{terminal}')
        # A reward segment followed by the exported bootstrap remainder forms target.
        reward_segment=segment(p(0,1.7),p(reward,1.7),PURPLE,8)
        bootstrap_segment=segment(p(reward,1.7),p(q['target'],1.7),GOLD,8)
        c.play(m.Create(reward_segment),seconds=1.2)
        c.play(m.Create(bootstrap_segment),seconds=2)
        target=dot(p(q['target'],1.7),GOLD,.11)
        scene.add(target)
        c.play(m.Create(segment(p(old,.4),p(q['target'],.4),MUTED,2)),
               particle.animate.move_to(p(q['updated'],.4)),seconds=3)
        scene.add(eq(r'\alpha=0.2',1.5,.95,35))
        c.at(26)
        # Both terminal choices start from the same old Q, not two successive updates.
        scene.add(dot(p(q['updated'],.4),MUTED,.055))
        particle.move_to(p(old,.4))
        c.play(m.FadeOut(bootstrap_segment),target.animate.move_to(p(terminal['target'],1.7)),
               particle.animate.move_to(p(terminal['updated'],.4)),seconds=2.5)
        scene.add(eq(r'\mathrm{terminal}=1',0,2.3,34,GREEN))
        c.finish(r'\alpha')
        return
    c=Film(scene,r'P(s^\prime,r\mid s,a)' if slug=='rltransition' else r'V^\prime=\max_a\sum_{s^\prime}P(r+\gamma V)')
    positions,cells=grid(scene)
    if slug=='rltransition':
        agent=dot(positions[8],BLUE,.16)
        scene.add(agent,eq(r'a=\uparrow',-4.6,-1.45,35,BLUE))
        c.predict(r'\mathrm{slip}')
        yvalues=[1.65,.5,-.65]
        branches=[]
        for choice,y in zip(f['choices'],yvalues):
            x=2.8
            packet=dot(positions[8],GOLD,.07+.13*choice['probability'])
            scene.add(packet)
            c.play(packet.animate.move_to(positions[choice['next']]),seconds=1.5)
            branches.append(packet)
            scene.add(segment([1,y,0],[1+4*choice['probability'],y,0],GOLD,13),
                      eq(f"P_{choice['next']}={choice['probability']:.2f}",3,y+.35,31,GOLD))
        c.at(26)
        scene.add(eq('r=-0.04',2.8,-1.35,34,GREEN))
        c.finish(r'\mathrm{slip}')
    else:
        # State values are opacity/number, never cell positions or physical heights.
        numbers=[eq('0',p[0],p[1]-.12,28,BLUE) for p in positions]
        scene.add(*numbers)
        c.predict(r'P,r')
        for values,links in [(f['sweep']['values'],[(3,2)]),(f['sweep2']['values'],[(2,1),(2,6)])]:
            packets=[dot(positions[a],GOLD,.11) for a,b in links]
            scene.add(*packets)
            c.play(*(packet.animate.move_to(positions[b]) for packet,(a,b) in zip(packets,links)),seconds=2.2)
            scene.remove(*packets)
            updated=[eq(f'{v:.2f}',p[0],p[1]-.12,28,GREEN if v>0 else BLUE) for p,v in zip(positions,values)]
            c.play(*(m.FadeOut(n) for n in numbers),seconds=.4)
            c.play(*(m.FadeIn(n) for n in updated),
                   *(cell.animate.set_fill(GREEN if v>0 else BLUE,opacity=.05+.5*abs(v))
                     for i,(cell,v) in enumerate(zip(cells,values)) if i not in (3,7)),seconds=.6)
            numbers=updated
        c.at(26)
        # Show all action values used by the second sweep at state1, not one sample.
        qs=f['sweep2']['q'][1]
        for i,value in enumerate(qs):
            y=1.7-i*.65
            scene.add(text(['↑','→','↓','←'][i],.8,y,30,MUTED),
                      segment([1.4,y,0],[1.4+3.6*value,y,0],GREEN if value==max(qs) else MUTED,13),
                      eq(f'{value:.2f}',5.25,y,29,GREEN if value==max(qs) else MUTED))
        c.finish(r'\gamma')


def present(scene,f):
    slug=f['slug']
    if slug=='vaeposterior': posterior(scene,f)
    elif slug=='vaeelbo': elbo(scene,f)
    elif slug in ('vaetraining','gantraining'): weights(scene,f)
    elif slug=='ganforward': network(scene,f)
    elif slug in ('vaegeneration','gandiversity','rlpolicy'): transport(scene,f)
    elif slug=='ganobjectives': gradients(scene,f)
    elif slug.startswith('diffusion'): diffusion(scene,f)
    elif slug.startswith('gnn'): graph_film(scene,f)
    elif slug.startswith('rl'): reinforcement(scene,f)
    else: raise ValueError(slug)
