#!/usr/bin/env python3
"""Add a synthetic vector-heavy PDF note to a test simulator, preserving its catalog."""
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

if len(sys.argv) != 2:
    raise SystemExit('Usage: seed-pdf-detail-audit.py SIMULATOR_UUID')
container = Path(subprocess.check_output([
    'xcrun', 'simctl', 'get_app_container', sys.argv[1], 'com.builderpro.opennotes', 'data'
], text=True).strip())
documents = container / 'Documents'
catalog_path = documents / 'notes-catalog.json'
catalog = json.loads(catalog_path.read_text())
if catalog.get('version') != 1 or not isinstance(catalog.get('notes'), list):
    raise ValueError('Unexpected catalog; nothing was changed')
note_id = 'audit-pdf-detail'
pdf_path = documents / 'pdfs' / (note_id + '.pdf')
pdf_path.parent.mkdir(parents=True, exist_ok=True)
# Fine vector lines and small text remain vectors; no raster image is embedded.
commands = [b'1 1 1 rg 0 0 612 792 re f\n', b'0 0 0 RG 0.30 w\n']
for index in range(200):
    x = 140 + index * 1.2
    commands.append(f'{x:.1f} 250 m {x:.1f} 540 l S\n'.encode())
commands.append(b'BT /F1 8 Tf 140 555 Td (Fine vector text for PDF zoom quality) Tj ET\n')
stream = b''.join(commands)
objects = [b'<< /Type /Catalog /Pages 2 0 R >>',
           b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
           b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
           b'<< /Length ' + str(len(stream)).encode() + b' >>\nstream\n' + stream + b'endstream',
           b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
pdf = bytearray(b'%PDF-1.4\n')
offsets = [0]
for index, obj in enumerate(objects, 1):
    offsets.append(len(pdf)); pdf += f'{index} 0 obj\n'.encode() + obj + b'\nendobj\n'
xref = len(pdf)
pdf += f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
for offset in offsets[1:]: pdf += f'{offset:010d} 00000 n \n'.encode()
pdf += f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
pdf_path.write_bytes(pdf)
bodies = documents / 'notebook-bodies'; bodies.mkdir(parents=True, exist_ok=True)
body = {'version':'1.0','originalCanvasWidth':820,'pages':[{'id':'pdf-detail-page','title':'Page 1',
        'rotation':0,'data':'{"pages":{}}','pageType':'pdf','pdfPageNumber':1,'textBoxes':[],'insertedElements':[]}]}
(bodies / (note_id + '.body')).write_text(json.dumps(body))
now = datetime.now(timezone.utc).isoformat()
catalog['notes'] = [note for note in catalog['notes'] if note['id'] != note_id]
catalog['notes'].append({'id':note_id,'title':'Audit fine PDF detail','folderId':None,'createdAt':now,
                         'updatedAt':'2099-01-01T00:00:00Z','backgroundType':'pdf','pdfUri':pdf_path.as_uri(),'thumbnailUri':None})
catalog.setdefault('deletedNoteIds', {}).pop(note_id, None)
temporary = catalog_path.with_suffix('.pdf-detail-audit-tmp')
temporary.write_text(json.dumps(catalog))
temporary.replace(catalog_path)
