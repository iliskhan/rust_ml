"""Render narrated 40-second film and poster at 30 seconds."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from render_support import render_scene
from diffusionforward import TopicScene

if __name__ == '__main__':
    render_scene(TopicScene, 'diffusionforward', 30)
