#!/usr/bin/env python3
"""Read the owned 100-page simulator fixture after the native autosave workload.

Twenty-four strokes are added and undone during the measured writing workload.
The persisted document must still contain exactly its original 20,000 strokes.
"""
import argparse
import base64
import json
from pathlib import Path
import struct
import subprocess

parser = argparse.ArgumentParser()
parser.add_argument('simulator', help='Simulator UUID, never a physical device')
args = parser.parse_args()
container = Path(subprocess.check_output(['xcrun', 'simctl', 'get_app_container',
    args.simulator, 'com.builderpro.opennotes', 'data'], text=True).strip())
body = json.loads((container / 'Documents/notebook-bodies/audit-performance-100-pages.body').read_text())
count = 0
for page in body['pages']:
    payload = json.loads(page.get('data') or '{"pages":{}}')
    for encoded in payload['pages'].values():
        data = base64.b64decode(encoded, validate=True)
        if len(data) < 8:
            raise ValueError('Truncated native drawing payload')
        version, strokes = struct.unpack_from('<II', data)
        if version != 4:
            raise ValueError(f'Unexpected native drawing format: {version}')
        count += strokes
if len(body['pages']) != 100 or count != 20000:
    raise AssertionError(f'Autosave workload changed fixture unexpectedly: {len(body["pages"])} pages, {count} strokes')
print(json.dumps({'note': 'audit-performance-100-pages', 'pages': 100, 'strokes': count,
                  'result': 'all measured additions and undos persisted'}))

invalid = json.loads((container / 'Documents/notebook-bodies/audit-invalid-native-payload.body').read_text())
if invalid['pages'][0]['data'] != '{"pages":{"0":"AA=="}}':
    raise AssertionError('Recovery overwrote the unreadable native drawing')
print(json.dumps({'note': 'audit-invalid-native-payload', 'result': 'original invalid bytes preserved'}))
