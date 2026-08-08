'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const { canWrite, safeFile } = require('../index');

test('local loopback requests may use demo write endpoints', () => {
  assert.equal(canWrite({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), true);
  assert.equal(canWrite({ socket: { remoteAddress: '::1' }, headers: {} }), true);
});

test('remote writes are denied by default', () => {
  assert.equal(canWrite({ socket: { remoteAddress: '203.0.113.10' }, headers: {} }), false);
});

test('static file resolver rejects path traversal', () => {
  const root = path.resolve('/tmp/example-root');
  assert.equal(safeFile(root, '../secret.txt'), null);
  assert.equal(safeFile(root, '../../etc/passwd'), null);
  assert.equal(safeFile(root, 'assets/app.js'), path.join(root, 'assets', 'app.js'));
});
