#!/usr/bin/env python3
"""Sample only the owned audit app during a failed-budget diagnostic rerun."""
from pathlib import Path
import signal
import subprocess
import sys
import time

if len(sys.argv) != 3:
    raise SystemExit("Usage: sample-canvas-process.py APP_BINARY OUTPUT_DIRECTORY")
binary, output = sys.argv[1], Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)
seen = set()
sampled = 0
stopping = False
active = None

def stop(_signum, _frame):
    global stopping
    stopping = True
    if active is not None and active.poll() is None:
        active.send_signal(signal.SIGINT)

signal.signal(signal.SIGTERM, stop)
signal.signal(signal.SIGINT, stop)
deadline = time.monotonic() + 300
# Ignore an app left open by the preceding timing run.
initial = subprocess.check_output(["ps", "-axo", "pid=,comm="], text=True)
for line in initial.splitlines():
    fields = line.strip().split(maxsplit=1)
    if len(fields) == 2 and fields[1].endswith(f"/{binary}.app/{binary}"):
        seen.add(int(fields[0]))
try:
    while not stopping and time.monotonic() < deadline and sampled < 3:
        listing = subprocess.check_output(["ps", "-axo", "pid=,comm="], text=True)
        for line in listing.splitlines():
            fields = line.strip().split(maxsplit=1)
            if len(fields) != 2 or not fields[1].endswith(f"/{binary}.app/{binary}"):
                continue
            pid = int(fields[0])
            if pid in seen:
                continue
            seen.add(pid)
            sampled += 1
            report = output / f"{binary}-{pid}.sample.txt"
            print(f"Sampling owned canvas app PID {pid}", flush=True)
            active = subprocess.Popen(["sample", str(pid), "90", "5", "-file", str(report)],
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            active.wait()
            active = None
            break
        if not stopping:
            time.sleep(0.2)
finally:
    if active is not None and active.poll() is None:
        active.send_signal(signal.SIGINT)
        active.wait(timeout=5)
