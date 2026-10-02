import assert from 'node:assert/strict';
import test from 'node:test';
import { rebaseAppDocumentUri, withCurrentImagePaths } from '../src/utils/appDocumentUri.ts';

const IOS_DOCS = 'file:///var/mobile/Containers/Data/Application/NEW-UUID/Documents/';

test('re-roots an inserted image saved under a previous iOS container', () => {
  assert.equal(
    rebaseAppDocumentUri(
      'file:///private/var/mobile/Containers/Data/Application/OLD/Documents/images/note%20x/img_1.jpg',
      IOS_DOCS,
    ),
    `${IOS_DOCS}images/note%20x/img_1.jpg`,
  );
});

test('re-roots Android files/ image paths', () => {
  assert.equal(
    rebaseAppDocumentUri(
      'file:///data/user/0/com.old/files/images/n/a.png',
      'file:///data/user/0/com.builderpro.opennotes/files/',
    ),
    'file:///data/user/0/com.builderpro.opennotes/files/images/n/a.png',
  );
});

test('leaves current, foreign and non-file URIs untouched', () => {
  const current = `${IOS_DOCS}images/n/a.png`;
  assert.equal(rebaseAppDocumentUri(current, IOS_DOCS), current);
  const tmp = 'file:///var/mobile/Containers/Data/Application/OLD/tmp/ImagePicker/a.jpg';
  assert.equal(rebaseAppDocumentUri(tmp, IOS_DOCS), tmp);
  const dataUri = 'data:image/png;base64,AAAA';
  assert.equal(rebaseAppDocumentUri(dataUri, IOS_DOCS), dataUri);
  assert.equal(rebaseAppDocumentUri('file:///x/Documents/images/a.png', ''), 'file:///x/Documents/images/a.png');
});

test('a note body with stale image paths is re-rooted, everything else kept', () => {
  const stale = 'file:///var/mobile/Containers/Data/Application/OLD/Documents/images/n/a.jpg';
  const data = {
    version: '1.0',
    pages: [
      { id: 'p1', data: '', insertedElements: [{ id: 'e1', type: 'image', x: 1, y: 2, sourceUri: stale }] },
      { id: 'p2', data: '' },
    ],
  };

  const result = withCurrentImagePaths(data, IOS_DOCS);

  assert.equal(result.pages[0].insertedElements[0].sourceUri, `${IOS_DOCS}images/n/a.jpg`);
  assert.equal(result.pages[0].insertedElements[0].x, 1);
  assert.equal(result.pages[1], data.pages[1]);
});

test('a note body that needs no changes is returned as the same object', () => {
  const data = {
    version: '1.0',
    pages: [{ id: 'p1', data: '', insertedElements: [{ id: 'e1', sourceUri: `${IOS_DOCS}images/n/a.jpg` }] }],
  };

  assert.equal(withCurrentImagePaths(data, IOS_DOCS), data);
});

test('a stored path that climbs out of the images folder is never re-rooted', () => {
  const crafted = 'file:///var/mobile/Containers/Data/Application/OLD/Documents/images/../../Library/x.db';
  assert.equal(rebaseAppDocumentUri(crafted, IOS_DOCS), crafted);
});
