import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from foundations_scene import FoundationsScene

class TopicScene(FoundationsScene):
    slug = 'mse'
