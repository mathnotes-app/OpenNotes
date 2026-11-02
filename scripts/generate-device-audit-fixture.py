#!/usr/bin/env python3
"""Generate one synthetic dense note for the isolated device-audit app."""
import argparse
import base64
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import struct

parser = argparse.ArgumentParser()
parser.add_argument('destination', help='New local directory for the isolated app Documents contents')
args = parser.parse_args()
documents = Path(args.destination)
documents.mkdir(parents=True, exist_ok=False)
width, height, scale = 820, 1061, 2
payload = bytearray(struct.pack('<II', 4, 200))
for stroke in range(200):
    payload += struct.pack('<BIfBI', 0, 0xff172033, 2.5 * scale, 255, 32)
    left = 30 + (stroke % 8) * ((width - 60) / 8)
    top = 30 + (stroke // 8) * ((height - 90) / 25)
    for point in range(32):
        payload += struct.pack('<ffffff', (left + point * 2) * scale,
                               (top + math.sin(point * .55 + stroke) * 8) * scale,
                               .75 + math.sin(point * .25) * .15, 0, math.pi / 2, 2.5 * scale)
    payload += struct.pack('<IfI', 0, 1, 3) + b'pen' + struct.pack('<I', 0)
ink = json.dumps({'pages': {'0': base64.b64encode(payload).decode()}}, separators=(',', ':'))
note_id = 'audit-performance-100-pages'
body = {'version': '1.0', 'originalCanvasWidth': width, 'pages': [
    {'id': f'{note_id}-page-{index + 1}', 'title': f'Page {index + 1}', 'rotation': 0,
     'data': ink, 'textBoxes': [], 'images': []} for index in range(100)]}
bodies = documents / 'notebook-bodies'
bodies.mkdir()
(bodies / f'{note_id}.body').write_text(json.dumps(body, separators=(',', ':')))
now = datetime.now(timezone.utc).isoformat()
catalog = {'version': 1, 'notes': [{'id': note_id, 'title': 'Audit 100 pages', 'folderId': None,
    'createdAt': now, 'updatedAt': now, 'backgroundType': 'lined', 'pdfUri': None, 'thumbnailUri': None}],
    'folders': [], 'deletedNoteIds': {}}
(documents / 'notes-catalog.json').write_text(json.dumps(catalog, separators=(',', ':')))
print(f'Generated a synthetic note under {documents}')
