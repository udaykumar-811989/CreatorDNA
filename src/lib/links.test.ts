import assert from 'node:assert/strict';
import { test } from 'node:test';

import { safeExternalUrl } from './links';

test('allows the schemes the app legitimately opens', () => {
  assert.equal(safeExternalUrl('https://www.instagram.com/p/abc/'), 'https://www.instagram.com/p/abc/');
  assert.equal(safeExternalUrl('http://example.com/post'), 'http://example.com/post');
  assert.equal(
    safeExternalUrl('mailto:support@creatordna.app?subject=Hi'),
    'mailto:support@creatordna.app?subject=Hi',
  );
  assert.equal(safeExternalUrl('tel:+15551234567'), 'tel:+15551234567');
});

test('rejects script and data schemes (XSS vector on web)', () => {
  assert.equal(safeExternalUrl('javascript:alert(document.cookie)'), null);
  assert.equal(safeExternalUrl('JavaScript:alert(1)'), null);
  assert.equal(safeExternalUrl('data:text/html,<script>alert(1)</script>'), null);
  assert.equal(safeExternalUrl('vbscript:msgbox(1)'), null);
  assert.equal(safeExternalUrl('file:///etc/passwd'), null);
  assert.equal(safeExternalUrl('intent://scan#Intent;scheme=zxing;end'), null);
});

test('rejects protocol-relative and empty values', () => {
  assert.equal(safeExternalUrl('//evil.example.com/x'), null);
  assert.equal(safeExternalUrl(''), null);
  assert.equal(safeExternalUrl('   '), null);
});

test('promotes schemeless hosts to https', () => {
  assert.equal(safeExternalUrl('example.com/post'), 'https://example.com/post');
  assert.equal(safeExternalUrl('sub.example.co.uk/a?b=1'), 'https://sub.example.co.uk/a?b=1');
  // Not host-looking: stays rejected instead of becoming a relative path.
  assert.equal(safeExternalUrl('not a url'), null);
  assert.equal(safeExternalUrl('/local/path'), null);
});
