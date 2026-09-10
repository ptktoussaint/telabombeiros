'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { RenegotiationLimiter } = require('../lib/renegotiation');

test('libera ate o limite e depois bloqueia o par', () => {
  const limiter = new RenegotiationLimiter({ maxAttempts: 5, windowMs: 120000 });
  for (let i = 1; i <= 5; i += 1) {
    const res = limiter.register('sala1', 'v1', 1000 * i);
    assert.strictEqual(res.allowed, true, `tentativa ${i}`);
    assert.strictEqual(res.attempts, i);
  }
  const bloqueado = limiter.register('sala1', 'v1', 6000);
  assert.strictEqual(bloqueado.allowed, false);
  assert.ok(bloqueado.retryAfterMs > 0);
});

test('o bloqueio e por par: nao contamina outro espectador nem outra sala', () => {
  const limiter = new RenegotiationLimiter({ maxAttempts: 2, windowMs: 120000 });
  limiter.register('sala1', 'v1', 0);
  limiter.register('sala1', 'v1', 1);
  assert.strictEqual(limiter.register('sala1', 'v1', 2).allowed, false);
  assert.strictEqual(limiter.register('sala1', 'v2', 2).allowed, true);
  assert.strictEqual(limiter.register('sala2', 'v1', 2).allowed, true);
});

test('passada a janela de tempo o par volta a poder tentar', () => {
  const limiter = new RenegotiationLimiter({ maxAttempts: 2, windowMs: 1000 });
  limiter.register('sala1', 'v1', 0);
  limiter.register('sala1', 'v1', 100);
  assert.strictEqual(limiter.register('sala1', 'v1', 200).allowed, false);
  assert.strictEqual(limiter.register('sala1', 'v1', 1500).allowed, true);
});

test('clear e clearRoom zeram o historico', () => {
  const limiter = new RenegotiationLimiter({ maxAttempts: 1, windowMs: 1000 });
  limiter.register('sala1', 'v1', 0);
  assert.strictEqual(limiter.register('sala1', 'v1', 1).allowed, false);
  limiter.clear('sala1', 'v1');
  assert.strictEqual(limiter.register('sala1', 'v1', 2).allowed, true);

  limiter.register('sala1', 'v2', 2);
  limiter.clearRoom('sala1');
  assert.strictEqual(limiter.attempts.size, 0);
});
