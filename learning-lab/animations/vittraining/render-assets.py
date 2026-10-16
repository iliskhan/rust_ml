import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from render_support import render_scene
from vittraining import TopicScene

if __name__ == "__main__":
    render_scene(TopicScene,"vittraining",30)
