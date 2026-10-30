#!/usr/bin/env python3
"""Choose the newest installed stable Xcode for the isolated native audit."""
from pathlib import Path
import re

candidates = []
for app in Path("/Applications").glob("Xcode_*.app"):
    match = re.fullmatch(r"Xcode_(\d+(?:\.\d+)*)\.app", app.name)
    if match:
        candidates.append((tuple(int(part) for part in match[1].split(".")), app))
selected = max(candidates)[1] if candidates else Path("/Applications/Xcode.app")
developer = selected / "Contents/Developer"
if not developer.is_dir():
    raise SystemExit("No installed stable Xcode was found")
print(developer)
