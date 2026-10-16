"""Обучаем denoiser: causal density geometry from the TS trace."""
import json
import sys
from pathlib import Path
import manimgx as m
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'vaeposterior'))
from scene_geometry import present

class TopicScene(m.Scene):
    def construct(self):
        fixture = json.loads(Path(__file__).with_name('fixture.json').read_text(encoding='utf-8'))
        present(self, fixture)
