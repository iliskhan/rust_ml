"""Render narration and poster with the shared native ManimGX pipeline."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from render_support import render_scene
from backprop import BackpropSharedNode

if __name__ == '__main__':
    render_scene(BackpropSharedNode, 'backprop', 35)
