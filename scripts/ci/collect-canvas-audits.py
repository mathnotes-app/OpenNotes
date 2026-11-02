#!/usr/bin/env python3
"""Collect timing-only reports on an isolated CI runner, even after Xcode shuts down its simulator."""
from pathlib import Path
import shutil
import sys

if len(sys.argv) != 2:
    raise SystemExit("Usage: collect-canvas-audits.py OUTPUT_DIRECTORY")
destination = Path(sys.argv[1])
destination.mkdir(parents=True, exist_ok=True)
root = Path.home() / "Library/Developer/CoreSimulator/Devices"
reports = list(root.glob("*/data/Containers/Data/Application/*/Library/Caches/MobileInkAudits/*.json"))
for report in reports:
    shutil.copy2(report, destination / report.name)
print(f"Collected {len(reports)} native timing reports")
