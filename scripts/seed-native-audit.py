#!/usr/bin/env python3
"""Seed owned audit notes into an installed OpenNotes simulator app.

Preserves all unrelated catalog entries and bodies. The app must be stopped;
only the explicitly named audit fixtures below are replaced. No physical-device writes.
"""
import argparse
import base64
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import struct
import subprocess
import zlib

parser = argparse.ArgumentParser()
parser.add_argument('simulator', help='Simulator UUID (not a physical device)')
args = parser.parse_args()
bundle = 'com.builderpro.opennotes'
subprocess.run(['xcrun', 'simctl', 'terminate', args.simulator, bundle],
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
container = Path(subprocess.check_output(
    ['xcrun', 'simctl', 'get_app_container', args.simulator, bundle, 'data'], text=True).strip())
documents = container / 'Documents'
catalog_path = documents / 'notes-catalog.json'
catalog = json.loads(catalog_path.read_text()) if catalog_path.exists() else {
    'version': 1, 'notes': [], 'folders': [], 'deletedNoteIds': {}}
if catalog.get('version') != 1 or not isinstance(catalog.get('notes'), list):
    raise ValueError('Unexpected catalog shape; leaving it unchanged')

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
bodies = documents / 'notebook-bodies'
bodies.mkdir(parents=True, exist_ok=True)
now = datetime.now(timezone.utc).isoformat()
for count in [100, 1, 2]:
    note_id = 'audit-cross-page' if count == 2 else f'audit-performance-{count}-pages'
    body = {'version': '1.0', 'originalCanvasWidth': width, 'pages': [
        {'id': f'{note_id}-page-{i + 1}', 'title': f'Page {i + 1}', 'rotation': 0,
         'data': ink if count != 2 or i == 0 else '{"pages":{}}',
         'textBoxes': [], 'images': []} for i in range(count)]}
    path = bodies / f'{note_id}.body'
    temporary = path.with_suffix('.audit-tmp')
    temporary.write_text(json.dumps(body, separators=(',', ':')))
    temporary.replace(path)
    catalog['notes'] = [note for note in catalog['notes'] if note['id'] != note_id]
    catalog['notes'].append({'id': note_id, 'title': f'Audit {count} pages', 'folderId': None,
                             'createdAt': now, 'updatedAt': now, 'backgroundType': 'plain' if count == 2 else 'lined',
                             'pdfUri': None, 'thumbnailUri': None})
    catalog.setdefault('deletedNoteIds', {}).pop(note_id, None)
# A single image is owned by page two but overlaps the first page.
asset_id = 'audit-cross-asset'
asset_dir = documents / 'images' / asset_id
asset_dir.mkdir(parents=True, exist_ok=True)
def png_chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
png = b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', 20, 20, 8, 2, 0, 0, 0))
png += png_chunk(b'IDAT', zlib.compress((b'\0' + bytes([240, 170, 30]) * 20) * 20)) + png_chunk(b'IEND', b'')
asset_path = asset_dir / 'cross.png'
asset_path.write_bytes(png)
asset_pages = [{'id': f'{asset_id}-{i}', 'title': f'Page {i+1}', 'rotation': 0,
                'data': '{"pages":{}}', 'textBoxes': [], 'insertedElements': []} for i in range(2)]
asset_pages[1]['insertedElements'] = [{'id': 'cross-image', 'type': 'image', 'x': 280, 'y': -70,
    'width': 180, 'height': 140, 'rotation': 0, 'zIndex': 1, 'sourceUri': asset_path.as_uri(),
    'aspectRatio': 180/140, 'createdAt': now, 'updatedAt': now}]
(bodies / f'{asset_id}.body').write_text(json.dumps({'version': '1.0', 'originalCanvasWidth': width, 'pages': asset_pages}))
catalog['notes'] = [note for note in catalog['notes'] if note['id'] != asset_id]
catalog['notes'].append({'id': asset_id, 'title': 'Audit crossing asset', 'folderId': None,
    'createdAt': now, 'updatedAt': now, 'backgroundType': 'plain', 'pdfUri': None, 'thumbnailUri': None})
catalog.setdefault('deletedNoteIds', {}).pop(asset_id, None)
rotated_id = 'audit-rotated-asset'
rotated_pages = json.loads(json.dumps(asset_pages))
rotated_pages[1]['insertedElements'][0]['rotation'] = 90
rotated_dir = documents / 'images' / rotated_id
rotated_dir.mkdir(parents=True, exist_ok=True)
rotated_path = rotated_dir / 'quadrants.png'
colors = [(230, 55, 45), (45, 180, 80), (40, 105, 230), (245, 200, 35)]
rows = bytearray()
for row in range(80):
    rows.append(0)
    for column in range(80):
        color = colors[(2 if row >= 40 else 0) + (1 if column >= 40 else 0)]
        rows.extend((30, 30, 30) if column in (0, 39, 40, 79) or row in (0, 39, 40, 79) else color)
rotated_png = b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', 80, 80, 8, 2, 0, 0, 0))
rotated_png += png_chunk(b'IDAT', zlib.compress(rows)) + png_chunk(b'IEND', b'')
rotated_path.write_bytes(rotated_png)
rotated_pages[1]['insertedElements'][0]['sourceUri'] = rotated_path.as_uri()

(bodies / f'{rotated_id}.body').write_text(json.dumps({'version': '1.0', 'originalCanvasWidth': width, 'pages': rotated_pages}))
catalog['notes'] = [note for note in catalog['notes'] if note['id'] != rotated_id]
catalog['notes'].append({'id': rotated_id, 'title': 'Audit rotated asset', 'folderId': None,
    'createdAt': now, 'updatedAt': now, 'backgroundType': 'plain', 'pdfUri': None, 'thumbnailUri': None})
catalog.setdefault('deletedNoteIds', {}).pop(rotated_id, None)
text_id = 'audit-cross-text'
text_pages = [{'id': f'{text_id}-{i}', 'title': f'Page {i+1}', 'rotation': 0,
               'data': '{"pages":{}}', 'textBoxes': [], 'insertedElements': []} for i in range(2)]
text_pages[1]['textBoxes'] = [{'id': 'cross-text', 'x': 280, 'y': -70, 'width': 240, 'height': 140,
    'content': 'Above the edge\nAcross two pages\nOne text box\nBelow the edge', 'fontSize': 22, 'color': '#111827', 'isEditing': False}]
(bodies / f'{text_id}.body').write_text(json.dumps({'version': '1.0', 'originalCanvasWidth': width, 'pages': text_pages}))
catalog['notes'] = [note for note in catalog['notes'] if note['id'] != text_id]
catalog['notes'].append({'id': text_id, 'title': 'Audit crossing text', 'folderId': None,
    'createdAt': now, 'updatedAt': now, 'backgroundType': 'plain', 'pdfUri': None, 'thumbnailUri': None})
catalog.setdefault('deletedNoteIds', {}).pop(text_id, None)
# Editable strokes with dense, overlapping eraser history exercise the
# background mask optimization without relying on a user's notebook.
eraser_id = 'audit-eraser-history'
eraser_payload = bytearray(struct.pack('<II', 4, 12))
for stroke in range(12):
    eraser_payload += struct.pack('<BIfBI', 0, 0xff172033, 5 * scale, 255, 40)
    y = 100 + stroke * 65
    for point in range(40):
        eraser_payload += struct.pack('<ffffff', (50 + point * 17) * scale, y * scale,
                                      .75, 0, math.pi / 2, 5 * scale)
    eraser_payload += struct.pack('<IfI', 0, 1, 3) + b'pen' + struct.pack('<I', 300)
    for point in range(300):
        eraser_payload += struct.pack('<fff', (300 + 35 * math.sin(point * .12)) * scale,
                                      (y + 12 * math.cos(point * .12)) * scale, 6 * scale)
eraser_ink = json.dumps({'pages': {'0': base64.b64encode(eraser_payload).decode()}}, separators=(',', ':'))
eraser_body = {'version': '1.0', 'originalCanvasWidth': width, 'pages': [
    {'id': 'audit-eraser-page', 'title': 'Page 1', 'rotation': 0, 'data': eraser_ink,
     'textBoxes': [], 'insertedElements': []}]}
(bodies / f'{eraser_id}.body').write_text(json.dumps(eraser_body))
catalog['notes'] = [note for note in catalog['notes'] if note['id'] != eraser_id]
catalog['notes'].append({'id': eraser_id, 'title': 'Audit eraser history', 'folderId': None,
    'createdAt': now, 'updatedAt': now, 'backgroundType': 'plain', 'pdfUri': None, 'thumbnailUri': None})
catalog.setdefault('deletedNoteIds', {}).pop(eraser_id, None)
# Structurally valid notebook with invalid native drawing bytes. Loading must
# show recovery controls without saving blank content over the original file.
invalid_id = 'audit-invalid-native-payload'
invalid_body = {'version': '1.0', 'originalCanvasWidth': width, 'pages': [
    {'id': 'invalid-native-page', 'title': 'Preserve this page', 'rotation': 0,
     'data': '{"pages":{"0":"AA=="}}', 'textBoxes': [], 'insertedElements': []}]}
(bodies / f'{invalid_id}.body').write_text(json.dumps(invalid_body))
catalog['notes'] = [note for note in catalog['notes'] if note['id'] != invalid_id]
catalog['notes'].append({'id': invalid_id, 'title': 'Audit invalid native payload', 'folderId': None,
    'createdAt': now, 'updatedAt': now, 'backgroundType': 'plain', 'pdfUri': None, 'thumbnailUri': None})
catalog.setdefault('deletedNoteIds', {}).pop(invalid_id, None)
# A PDF-only page with no cached preview exercises thumbnail regeneration.
pdf_id = 'audit-pdf-thumbnail'
pdf_dir = documents / 'pdfs'
pdf_dir.mkdir(parents=True, exist_ok=True)
pdf_path = pdf_dir / f'{pdf_id}.pdf'
stream = b'0.15 0.45 0.85 rg 0 0 320 480 re f\n'
objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
           b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
           b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 320 480] /Resources << >> /Contents 4 0 R >>',
           b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'endstream']
pdf = bytearray(b'%PDF-1.4\n')
offsets = [0]
for index, obj in enumerate(objects, 1):
    offsets.append(len(pdf))
    pdf += f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n'
xref = len(pdf)
pdf += f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
for offset in offsets[1:]: pdf += f'{offset:010d} 00000 n \n'.encode()
pdf += f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
pdf_path.write_bytes(pdf)
pdf_body = {'version': '1.0', 'originalCanvasWidth': width, 'pages': [
    {'id': 'audit-pdf-page', 'title': 'Page 1', 'rotation': 0,
     'data': '{"pages":{}}', 'pageType': 'pdf', 'pdfPageNumber': 1,
     'textBoxes': [], 'insertedElements': []}]}
(bodies / f'{pdf_id}.body').write_text(json.dumps(pdf_body))
catalog['notes'] = [note for note in catalog['notes'] if note['id'] != pdf_id]
catalog['notes'].append({'id': pdf_id, 'title': 'Audit PDF thumbnail', 'folderId': None,
    'createdAt': now, 'updatedAt': now, 'backgroundType': 'pdf', 'pdfUri': pdf_path.as_uri(), 'thumbnailUri': None})
catalog.setdefault('deletedNoteIds', {}).pop(pdf_id, None)
if catalog_path.exists():
    backup = catalog_path.with_suffix('.before-native-audit.json')
    if not backup.exists():
        backup.write_bytes(catalog_path.read_bytes())
temporary = catalog_path.with_suffix('.audit-tmp')
temporary.write_text(json.dumps(catalog, separators=(',', ':')))
temporary.replace(catalog_path)
print(f'Seeded performance and cross-page audit fixtures in {documents}')
