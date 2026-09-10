'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { LiveState } = require('../lib/liveState');

test('o admin monitorando nao aparece em campo nenhum do estado publicado', () => {
  const state = new LiveState();
  state.addViewer('sala1', { viewerId: 'v1', label: 'Convite' });
  state.addViewer('sala1', { viewerId: 'v2', label: 'Convite' });
  state.addViewer('sala1', { viewerId: 'admin-socket', label: 'Central', isAdminMonitor: true });

  assert.strictEqual(state.viewerCount('sala1'), 2);
  const snapshot = state.serializeRoom('sala1');
  assert.strictEqual(snapshot.viewerCount, 2);
  assert.deepStrictEqual(snapshot.viewers.map((v) => v.viewerId), ['v1', 'v2']);

  // Nada no objeto serializado pode denunciar que existe alguem monitorando:
  // nem contagem, nem o id do socket, nem o rotulo da central.
  const serializado = JSON.stringify(snapshot);
  assert.ok(!serializado.includes('admin-socket'), 'vazou o id do monitor');
  assert.ok(!serializado.includes('Central'), 'vazou o rotulo do monitor');
  assert.ok(!/monitor/i.test(serializado), 'vazou alguma contagem de monitores');

  // O monitor continua existindo internamente - a conexao WebRTC depende disso.
  assert.ok(state.getViewer('sala1', 'admin-socket'));
});

test('um mesmo id de socket pode estar em varias salas ao mesmo tempo', () => {
  const state = new LiveState();
  state.addViewer('sala1', { viewerId: 'admin-socket', isAdminMonitor: true });
  state.addViewer('sala2', { viewerId: 'admin-socket', isAdminMonitor: true });
  state.addViewer('sala3', { viewerId: 'outro' });

  assert.deepStrictEqual(state.roomsWatchedByViewer('admin-socket').sort(), ['sala1', 'sala2']);

  state.removeViewer('sala1', 'admin-socket');
  assert.deepStrictEqual(state.roomsWatchedByViewer('admin-socket'), ['sala2']);
});

test('so devolve o socket do transmissor quando ele esta online', () => {
  const state = new LiveState();
  state.transmitterConnected('sala1', 'socket-a', 'Sala 1');
  assert.strictEqual(state.getTransmitterSocketId('sala1'), 'socket-a');

  state.transmitterDisconnected('sala1', 'socket-a');
  assert.strictEqual(state.getTransmitterSocketId('sala1'), null);
  assert.strictEqual(state.serializeRoom('sala1').streamStatus, 'interrupted');
});

test('desconexao de socket antigo nao derruba o transmissor atual', () => {
  const state = new LiveState();
  state.transmitterConnected('sala1', 'socket-antigo', 'Sala 1');
  state.transmitterConnected('sala1', 'socket-novo', 'Sala 1');
  state.transmitterDisconnected('sala1', 'socket-antigo');
  assert.strictEqual(state.getTransmitterSocketId('sala1'), 'socket-novo');
});

test('cada mudanca avisa o painel por evento', () => {
  const state = new LiveState();
  const eventos = [];
  state.on('change', (payload) => eventos.push(payload));

  state.transmitterConnected('sala1', 'socket-a', 'Sala 1');
  state.addViewer('sala1', { viewerId: 'v1' });
  state.setStreamStatus('sala1', 'live');

  assert.strictEqual(eventos.length, 3);
  assert.strictEqual(eventos[2].streamStatus, 'live');
});

test('status de transmissao invalido e ignorado', () => {
  const state = new LiveState();
  state.registerRoom('sala1', 'Sala 1');
  state.setStreamStatus('sala1', 'corrigindo-prova');
  assert.strictEqual(state.serializeRoom('sala1').streamStatus, 'awaiting');
});
