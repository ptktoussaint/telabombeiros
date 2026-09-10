'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { sanitizeColors, sanitizeMediaUrl } = require('../lib/branding');

test('aceita apenas cores hexadecimais validas', () => {
  const atual = { brand: '#e11d1d', ink: '#0b0b0d' };
  const novo = sanitizeColors({ brand: '#00ff00', ink: 'javascript:alert(1)', ember: '#abc' }, atual);
  assert.strictEqual(novo.brand, '#00ff00');
  assert.strictEqual(novo.ink, '#0b0b0d');
  assert.strictEqual(novo.ember, '#abc');
});

test('ignora chaves de cor desconhecidas', () => {
  const novo = sanitizeColors({ hacker: '#000000' }, { brand: '#e11d1d' });
  assert.deepStrictEqual(novo, { brand: '#e11d1d' });
});

test('midia aceita arquivo enviado e link externo http(s)', () => {
  assert.strictEqual(sanitizeMediaUrl('/uploads/abc.png'), '/uploads/abc.png');
  assert.strictEqual(sanitizeMediaUrl('https://cdn.exemplo.com/logo.png'), 'https://cdn.exemplo.com/logo.png');
  assert.strictEqual(sanitizeMediaUrl('http://exemplo.com/f.mp4'), 'http://exemplo.com/f.mp4');
  assert.strictEqual(sanitizeMediaUrl('  '), '');
});

test('midia recusa esquema perigoso ou caminho de fora de uploads', () => {
  assert.strictEqual(sanitizeMediaUrl('javascript:alert(1)'), null);
  assert.strictEqual(sanitizeMediaUrl('data:text/html,<script>'), null);
  assert.strictEqual(sanitizeMediaUrl('/etc/passwd'), null);
});
