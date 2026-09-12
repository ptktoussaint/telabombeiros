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

/* ------------------- rede de seguranca: varredura de salas ------------------- */

const { shouldCloseStale } = require('../lib/roomLifecycle');

const MINUTO = 60000;
const AGORA = 1_000_000_000;

function sala(extra) {
  return Object.assign({ status: 'active', createdAt: new Date(AGORA), lastHostSeenAt: new Date(AGORA) }, extra);
}

test('sala criada e nunca aberta e encerrada depois da folga', () => {
  // Nunca houve desconexao para disparar o alarme, entao so a varredura pega este caso.
  const nova = sala({ lastHostSeenAt: new Date(AGORA) });
  assert.strictEqual(shouldCloseStale(nova, false, AGORA + 30000, MINUTO), false, 'cedo demais');
  assert.strictEqual(shouldCloseStale(nova, false, AGORA + MINUTO, MINUTO), true);
});

test('host conectado nunca tem a sala encerrada, por mais antiga que seja', () => {
  const antiga = sala({ lastHostSeenAt: new Date(AGORA - 10 * MINUTO) });
  assert.strictEqual(shouldCloseStale(antiga, true, AGORA, MINUTO), false);
});

test('host que acabou de sair ainda tem a folga inteira', () => {
  const recente = sala({ lastHostSeenAt: new Date(AGORA - 10000) });
  assert.strictEqual(shouldCloseStale(recente, false, AGORA, MINUTO), false);
});

test('sala orfa desde antes de um reinicio do servidor e encerrada', () => {
  // O alarme em memoria morreu junto com o processo; a marca no banco sobreviveu.
  const orfa = sala({ lastHostSeenAt: new Date(AGORA - 30 * MINUTO) });
  assert.strictEqual(shouldCloseStale(orfa, false, AGORA, MINUTO), true);
});

test('sala ja encerrada nao e encerrada de novo', () => {
  const fechada = sala({ status: 'closed', lastHostSeenAt: new Date(AGORA - 10 * MINUTO) });
  assert.strictEqual(shouldCloseStale(fechada, false, AGORA, MINUTO), false);
});

test('sala antiga sem marca nenhuma cai na data de criacao', () => {
  const semMarca = { status: 'active', createdAt: new Date(AGORA - 5 * MINUTO), lastHostSeenAt: null };
  assert.strictEqual(shouldCloseStale(semMarca, false, AGORA, MINUTO), true);
});

test('registro corrompido nao trava a varredura', () => {
  assert.strictEqual(shouldCloseStale(null, false, AGORA, MINUTO), false);
  assert.strictEqual(
    shouldCloseStale({ status: 'active', createdAt: null, lastHostSeenAt: null }, false, AGORA, MINUTO),
    true
  );
});
