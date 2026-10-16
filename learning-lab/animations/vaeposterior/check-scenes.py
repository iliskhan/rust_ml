"""CPU-only authored timeline/data smoke test; not a visual-render substitute."""
import ast
import importlib.util
import json
import math
from pathlib import Path
import sys
import types

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path(__file__).with_name('scene_geometry.py')


class Shape:
    def __init__(self,*args,**kwargs):
        self.submobjects=list(args) if self.__class__.__name__=='VGroup' else []
        self.position=[0,0,0]
        self.args=args
    @property
    def animate(self):return self
    def move_to(self,p):
        assert len(p)==3 and all(math.isfinite(float(v)) for v in p),p
        self.position=list(p)
        return self
    def set_fill(self,*args,**kwargs):
        assert 0<=kwargs.get('opacity',.5)<=1
        return self
    def set_color(self,*args,**kwargs):return self


class Scene:
    def __init__(self):self.duration=0
    def add(self,*args):pass
    def remove(self,*args):pass
    def play(self,*args,run_time):
        assert run_time>0
        self.duration+=run_time
    def wait(self,duration):
        assert duration>=0
        self.duration+=duration


if '--native-objects' in sys.argv:
    # Construct real MathTex/Text/primitives, but use the CPU-only Scene above.
    # No Manim scene, renderer, native window or GPU context is created.
    sys.path.insert(0,str(ROOT))
else:
    fake=types.ModuleType('manimgx')
    for name in ['VGroup','Dot','Line','Circle','Rectangle','MathTex','Text']:
        setattr(fake,name,type(name,(Shape,),{}))
    for name in ['FadeIn','FadeOut','Create','Transform']:
        setattr(fake,name,lambda *args:args)
    sys.modules['manimgx']=fake
    helper=types.ModuleType('topic_scene')
    helper.text=lambda *args:Shape(*args)
    for name in ['INK','MUTED','BLUE','GOLD','GREEN','PURPLE']:setattr(helper,name,name)
    sys.modules['topic_scene']=helper
spec=importlib.util.spec_from_file_location('scene_geometry',SOURCE)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

tree=ast.parse(SOURCE.read_text(encoding='utf-8'))
for node in ast.walk(tree):
    if isinstance(node,ast.Constant) and isinstance(node.value,str):
        assert node.value not in ['screenQuestion','screenResult','screenTask'],node.value
    if isinstance(node,ast.Attribute):
        assert node.attr!='ReplacementTransform','Do not morph heterogeneous groups'

slugs='vaeposterior vaeelbo vaetraining vaegeneration ganforward ganobjectives gantraining gandiversity diffusionforward diffusiontraining diffusionreverse diffusionsampling diffusionguidance gnnadjacency gnnmessage gnntraining gnndepth gnnvariants rltransition rlbellman rlqlearning rlpolicy'.split()
for slug in slugs:
    fixture=json.loads((ROOT/slug/'fixture.json').read_text(encoding='utf-8'))
    scene=Scene()
    module.present(scene,fixture)
    assert abs(scene.duration-40)<1e-8,(slug,scene.duration)
    print(f'{slug}: 40.000s, fixture fields and finite coordinates PASS')
print('22 scenes PASS; actual renderer/layout validation remains required.')
