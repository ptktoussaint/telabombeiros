'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { generateToken, hashToken, tokenMatches } = require('../lib/tokens');

test('gera tokens unicos e seguros para URL', () => {
  const a = generateToken();
  const b = generateToken();
  assert.notStrictEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]+$/);
  assert.ok(a.length >= 30);
});

test('hash e estavel e nunca igual ao token puro', () => {
  const token = generateToken();
  const hash = hashToken(token);
  assert.strictEqual(hash, hashToken(token));
  assert.notStrictEqual(hash, token);
  assert.strictEqual(hash.length, 64);
});

test('tokenMatches aceita o token certo e recusa o errado', () => {
  const token = generateToken();
  const hash = hashToken(token);
  assert.strictEqual(tokenMatches(token, hash), true);
  assert.strictEqual(tokenMatches(generateToken(), hash), false);
  assert.strictEqual(tokenMatches('', hash), false);
  assert.strictEqual(tokenMatches(token, ''), false);
  assert.strictEqual(tokenMatches(token, 'curto'), false);
});
