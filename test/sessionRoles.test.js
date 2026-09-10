'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { setRole, clearRoles, getRole, isAdmin, isTransmitterOf, isViewerOf } = require('../lib/sessionRoles');

test('assumir um papel apaga os dados do papel anterior', () => {
  const session = {};
  setRole(session, 'admin', { adminUsername: 'admin' });
  assert.strictEqual(isAdmin(session), true);

  // Mesmo navegador abrindo um link de espectador: o papel de admin tem que sumir.
  setRole(session, 'viewer', { roomId: 'sala1', viewerTokenId: 't1', viewerLabel: 'Convite' });
  assert.strictEqual(isAdmin(session), false);
  assert.strictEqual(session.adminUsername, undefined);
  assert.strictEqual(isViewerOf(session, 'sala1'), true);
});

test('transmissor de uma sala nao vale como transmissor de outra', () => {
  const session = {};
  setRole(session, 'transmitter', { roomId: 'sala1' });
  assert.strictEqual(isTransmitterOf(session, 'sala1'), true);
  assert.strictEqual(isTransmitterOf(session, 'sala2'), false);
  assert.strictEqual(isViewerOf(session, 'sala1'), false);
});

test('trocar de sala como espectador nao deixa residuo da sala antiga', () => {
  const session = {};
  setRole(session, 'viewer', { roomId: 'sala1', viewerTokenId: 'a', viewerLabel: 'Convite A' });
  setRole(session, 'viewer', { roomId: 'sala2', viewerTokenId: 'b', viewerLabel: 'Convite B' });
  assert.strictEqual(session.roomId, 'sala2');
  assert.strictEqual(session.viewerTokenId, 'b');
  assert.strictEqual(isViewerOf(session, 'sala1'), false);
});

test('clearRoles derruba qualquer papel e getRole recusa valor invalido', () => {
  const session = {};
  setRole(session, 'admin', {});
  clearRoles(session);
  assert.strictEqual(getRole(session), null);

  session.role = 'fiscal';
  assert.strictEqual(getRole(session), null);
  assert.throws(() => setRole(session, 'fiscal', {}), /papel invalido/);
});
