'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { liveState } = require('../lib/liveState');
const {
  scheduleCloseAfterHostLeft,
  cancelScheduledClose,
  disconnectRoomSockets,
  GRACE_MS,
} = require('../lib/roomLifecycle');

function socketFalso(id, role) {
  return {
    id,
    request: { session: { role } },
    desconectado: false,
    saiuDoCanal: false,
    disconnect() { this.desconectado = true; },
    leave() { this.saiuDoCanal = true; },
  };
}

function ioFalso(roomId, sockets) {
  return {
    emitidos: [],
    sockets: {
      adapter: { rooms: new Map([[`room:${roomId}`, new Set(sockets.map((s) => s.id))]]) },
      sockets: new Map(sockets.map((s) => [s.id, s])),
    },
    to(canal) {
      const io = this;
      return { emit: (evento, dados) => io.emitidos.push({ canal, evento, dados }) };
    },
  };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

test('a folga antes de encerrar existe e nao e instantanea', () => {
  // Um refresh da pagina do host precisa caber dentro dela.
  assert.ok(GRACE_MS >= 10000, 'folga curta demais para sobreviver a um refresh');
});

test('host que volta dentro da folga nao perde a sala', async () => {
  liveState.reset();
  liveState.transmitterConnected('sala1', 'socket-host', 'Sala 1');

  scheduleCloseAfterHostLeft(ioFalso('sala1', []), 'sala1', 15);
  await espera(60);

  // O transmissor continua registrado, entao o encerramento foi abortado.
  assert.ok(liveState.rooms.has('sala1'), 'a sala nao deveria ter sido encerrada');
  liveState.reset();
});

test('cancelar o agendamento impede o encerramento', async () => {
  liveState.reset();
  liveState.registerRoom('sala2', 'Sala 2');

  scheduleCloseAfterHostLeft(ioFalso('sala2', []), 'sala2', 15);
  assert.strictEqual(cancelScheduledClose('sala2'), true);
  await espera(60);

  assert.ok(liveState.rooms.has('sala2'), 'o encerramento cancelado nao deveria ter rodado');
  assert.strictEqual(cancelScheduledClose('sala2'), false, 'nao ha mais nada agendado');
  liveState.reset();
});

test('um novo agendamento substitui o anterior em vez de acumular', () => {
  const io = ioFalso('sala3', []);
  scheduleCloseAfterHostLeft(io, 'sala3', 5000);
  scheduleCloseAfterHostLeft(io, 'sala3', 5000);
  // Se tivessem acumulado, restaria um segundo timer para cancelar depois.
  assert.strictEqual(cancelScheduledClose('sala3'), true);
  assert.strictEqual(cancelScheduledClose('sala3'), false);
});

test('encerrar a sala derruba espectadores e transmissor, nunca o admin', () => {
  const host = socketFalso('s-host', 'transmitter');
  const espectador = socketFalso('s-viewer', 'viewer');
  const admin = socketFalso('s-admin', 'admin');
  const io = ioFalso('sala4', [host, espectador, admin]);

  const derrubados = disconnectRoomSockets(io, 'sala4');

  assert.strictEqual(host.desconectado, true);
  assert.strictEqual(espectador.desconectado, true);
  assert.strictEqual(derrubados, 2);

  // O socket do admin atende varias salas: derrubar cortaria o monitoramento de todas.
  assert.strictEqual(admin.desconectado, false, 'o admin nao pode ser desconectado');
  assert.strictEqual(admin.saiuDoCanal, true, 'o admin deve apenas sair do canal da sala');
});

test('sala sem ninguem conectado nao quebra o encerramento', () => {
  const io = ioFalso('sala5', []);
  io.sockets.adapter.rooms = new Map();
  assert.strictEqual(disconnectRoomSockets(io, 'sala5'), 0);
});
