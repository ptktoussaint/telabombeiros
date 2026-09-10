'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildIceServers, buildHmacCredential, hasTurn, warnIfNoTurn } = require('../lib/turn');

test('sem TURN configurado sobra apenas STUN', () => {
  const servers = buildIceServers({ STUN_URLS: 'stun:a:3478' });
  assert.strictEqual(servers.length, 1);
  assert.deepStrictEqual(servers[0].urls, ['stun:a:3478']);
  assert.strictEqual(hasTurn({}), false);
});

test('formato 1: credencial HMAC efemera (coturn use-auth-secret)', () => {
  const servers = buildIceServers(
    { STUN_URLS: 'stun:a:3478', TURN_URLS: 'turn:t:3478,turns:t:5349', TURN_SECRET: 'segredo', TURN_TTL: '600' },
    { identity: 'sala1', now: 1_000_000 }
  );
  const turn = servers[1];
  assert.deepStrictEqual(turn.urls, ['turn:t:3478', 'turns:t:5349']);
  assert.strictEqual(turn.username, `${1000 + 600}:sala1`);
  assert.ok(turn.credential.length > 0);

  const outro = buildHmacCredential('segredo', 600, 'sala1', 1_000_000);
  assert.strictEqual(turn.credential, outro.credential);
});

test('formato 2: usuario e senha fixos do provedor', () => {
  const servers = buildIceServers({
    TURN_URLS: 'turn:openrelay:80',
    TURN_USERNAME: 'usuario',
    TURN_CREDENTIAL: 'senha',
  });
  const turn = servers[servers.length - 1];
  assert.strictEqual(turn.username, 'usuario');
  assert.strictEqual(turn.credential, 'senha');
  assert.strictEqual(hasTurn({ TURN_URLS: 'turn:openrelay:80', TURN_USERNAME: 'u', TURN_CREDENTIAL: 's' }), true);
});

test('TURN_SECRET tem prioridade sobre usuario/senha fixos', () => {
  const servers = buildIceServers(
    { TURN_URLS: 'turn:t:3478', TURN_SECRET: 's', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'p' },
    { now: 0 }
  );
  assert.notStrictEqual(servers[1].username, 'u');
});

test('URL de TURN sem credencial nenhuma nao vira servidor invalido', () => {
  const servers = buildIceServers({ TURN_URLS: 'turn:t:3478' });
  assert.strictEqual(servers.length, 1);
  assert.strictEqual(hasTurn({ TURN_URLS: 'turn:t:3478' }), false);
});

test('avisa no log quando nao ha TURN', () => {
  const mensagens = [];
  const logger = { warn: (msg) => mensagens.push(msg) };
  assert.strictEqual(warnIfNoTurn({}, logger), true);
  assert.match(mensagens[0], /TURN/);
  assert.strictEqual(warnIfNoTurn({ TURN_URLS: 'turn:t:3478', TURN_SECRET: 's' }, logger), false);
  assert.strictEqual(mensagens.length, 1);
});
