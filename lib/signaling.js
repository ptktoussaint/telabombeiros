'use strict';

const Room = require('../models/Room');
const { getRole } = require('./sessionRoles');
const { liveState } = require('./liveState');
const { limiter } = require('./renegotiation');
const { scheduleCloseAfterHostLeft, cancelScheduledClose } = require('./roomLifecycle');
// Mesma escada de qualidade que roda no navegador, para o servidor validar o pedido
// em vez de repassar qualquer texto que o cliente mandar.
const Quality = require('../public/shared/quality.js');

const ADMIN_ROOM = 'admins';
const ADMIN_MONITOR_LABEL = 'Central de Monitoramento';
// O transmissor precisa saber que existe um par para abrir a conexao, mas nao pode
// saber que e o monitoramento: vai um rotulo neutro e a marca 'hidden', que o cliente
// dele usa para nao exibir esse par em lugar nenhum da interface.
const HIDDEN_PEER_LABEL = 'Espectador';

function roomChannel(roomId) {
  return `room:${roomId}`;
}

async function roomIsActive(roomId) {
  const room = await Room.findById(roomId).select('status roomLabel').catch(() => null);
  if (!room || room.status !== 'active') return null;
  return room;
}

function attachSignaling(io, sessionMiddleware) {
  io.engine.use(sessionMiddleware);

  // O painel do admin e atualizado por evento, nunca por polling.
  liveState.on('change', (payload) => {
    if (payload) io.to(ADMIN_ROOM).emit('live:room', payload);
  });

  io.on('connection', async (socket) => {
    // O papel vem da sessao do servidor. Nada que o cliente mande muda isso.
    const session = socket.request.session;
    const role = getRole(session);

    if (!role) {
      socket.emit('auth:error', { error: 'Sessao nao identificada.' });
      return socket.disconnect(true);
    }

    if (role === 'transmitter') return setupTransmitter(io, socket, session);
    if (role === 'viewer') return setupViewer(io, socket, session);
    return setupAdmin(io, socket, session);
  });
}

async function setupTransmitter(io, socket, session) {
  const roomId = String(session.roomId || '');
  const room = await roomIsActive(roomId);
  if (!room) {
    socket.emit('auth:error', { error: 'Sala encerrada ou inexistente.', closed: true });
    return socket.disconnect(true);
  }

  socket.join(roomChannel(roomId));
  // Host voltou dentro da folga: cancela o encerramento que estava agendado.
  cancelScheduledClose(roomId);
  liveState.transmitterConnected(roomId, socket.id, room.roomLabel);
  socket.emit('transmitter:ready', { roomId, roomLabel: room.roomLabel });

  // Entrada tardia ao contrario: quem ja estava assistindo e reapresentado ao transmissor,
  // que cria uma PeerConnection nova para cada um sem reiniciar nada.
  const live = liveState.rooms.get(roomId);
  if (live) {
    for (const viewer of live.viewers.values()) {
      socket.emit('viewer:joined', {
        roomId,
        viewerId: viewer.viewerId,
        label: viewer.isAdminMonitor ? HIDDEN_PEER_LABEL : viewer.label,
        hidden: viewer.isAdminMonitor,
      });
    }
  }

  socket.on('stream:status', ({ status } = {}) => {
    liveState.setStreamStatus(roomId, status);
    io.to(roomChannel(roomId)).emit('stream:status', { roomId, status });
  });

  socket.on('webrtc:offer', ({ viewerId, sdp } = {}) => {
    if (!viewerId || !sdp) return;
    if (!liveState.getViewer(roomId, viewerId)) return;
    io.to(String(viewerId)).emit('webrtc:offer', { roomId, sdp });
  });

  socket.on('webrtc:ice', ({ viewerId, candidate } = {}) => {
    if (!viewerId || !candidate) return;
    if (!liveState.getViewer(roomId, viewerId)) return;
    io.to(String(viewerId)).emit('webrtc:ice', { roomId, candidate });
  });

  socket.on('viewer:kick', ({ viewerId } = {}) => {
    const viewer = liveState.getViewer(roomId, viewerId);
    // Monitoramento do admin nunca pode ser derrubado por aqui - o transmissor
    // nem sabe que ele existe, entao um pedido assim so pode vir de cliente adulterado.
    if (!viewer || viewer.isAdminMonitor) return;

    const target = io.sockets.sockets.get(String(viewerId));
    if (!target) return;

    liveState.blockSession(roomId, target.request && target.request.sessionID);
    target.emit('viewer:kicked', { roomId });
    // Pequena folga para o aviso chegar antes da conexao cair.
    setTimeout(() => target.disconnect(true), 120);
  });

  socket.on('disconnect', () => {
    const ainda = liveState.getTransmitterSocketId(roomId);
    liveState.transmitterDisconnected(roomId, socket.id);
    // Se outro socket do host ja assumiu a sala, esta desconexao e de uma aba antiga.
    if (ainda && ainda !== socket.id) return;
    io.to(roomChannel(roomId)).emit('transmitter:offline', { roomId });
    scheduleCloseAfterHostLeft(io, roomId);
  });
}

async function setupViewer(io, socket, session) {
  const roomId = String(session.roomId || '');
  const room = await roomIsActive(roomId);
  if (!room) {
    socket.emit('auth:error', { error: 'Sala encerrada ou inexistente.' });
    return socket.disconnect(true);
  }

  if (liveState.isSessionBlocked(roomId, socket.request.sessionID)) {
    socket.emit('auth:error', { error: 'Voce foi desconectado desta transmissao.', kicked: true });
    return socket.disconnect(true);
  }

  const viewerId = socket.id;
  const label = session.viewerLabel || 'Espectador';

  socket.join(roomChannel(roomId));
  liveState.addViewer(roomId, { viewerId, label }, room.roomLabel);

  const liveRoom = liveState.serializeRoom(roomId);
  socket.emit('viewer:ready', {
    roomId,
    roomLabel: room.roomLabel,
    viewerId,
    transmitterOnline: Boolean(liveRoom && liveRoom.transmitterOnline),
    streamStatus: liveRoom ? liveRoom.streamStatus : 'awaiting',
  });

  notifyTransmitter(io, roomId, 'viewer:joined', { roomId, viewerId, label, hidden: false });

  socket.on('webrtc:answer', ({ sdp } = {}) => {
    if (!sdp) return;
    notifyTransmitter(io, roomId, 'webrtc:answer', { roomId, viewerId, sdp });
  });

  socket.on('webrtc:ice', ({ candidate } = {}) => {
    if (!candidate) return;
    notifyTransmitter(io, roomId, 'webrtc:ice', { roomId, viewerId, candidate });
  });

  socket.on('webrtc:request-renegotiate', () => handleRenegotiate(io, socket, roomId, viewerId));

  socket.on('quality:request', ({ level } = {}) => {
    if (!Quality.isValid(level) || level === Quality.AUTO) return;
    notifyTransmitter(io, roomId, 'quality:request', { roomId, viewerId, level });
  });

  socket.on('disconnect', () => {
    liveState.removeViewer(roomId, viewerId);
    limiter.clear(roomId, viewerId);
    notifyTransmitter(io, roomId, 'viewer:left', { roomId, viewerId });
  });
}

function setupAdmin(io, socket) {
  socket.join(ADMIN_ROOM);
  socket.emit('live:snapshot', { rooms: liveState.snapshot() });

  // Um unico socket do admin assiste varias salas ao mesmo tempo. Como o mesmo
  // socket.id passa a existir em varias salas, toda mensagem do admin carrega o roomId.
  const watching = new Set();

  socket.on('admin:watch', async ({ roomId } = {}, ack) => {
    const id = String(roomId || '');
    const room = await roomIsActive(id);
    if (!room) return typeof ack === 'function' && ack({ ok: false, error: 'Sala indisponivel.' });

    if (!watching.has(id)) {
      watching.add(id);
      socket.join(roomChannel(id));
      liveState.addViewer(
        id,
        { viewerId: socket.id, label: ADMIN_MONITOR_LABEL, isAdminMonitor: true },
        room.roomLabel
      );
      notifyTransmitter(io, id, 'viewer:joined', {
        roomId: id,
        viewerId: socket.id,
        label: HIDDEN_PEER_LABEL,
        hidden: true,
      });
    }

    const live = liveState.serializeRoom(id);
    return typeof ack === 'function' && ack({ ok: true, roomId: id, roomLabel: room.roomLabel, live });
  });

  socket.on('admin:unwatch', ({ roomId } = {}, ack) => {
    const id = String(roomId || '');
    stopWatching(io, socket, watching, id);
    return typeof ack === 'function' && ack({ ok: true, roomId: id });
  });

  socket.on('webrtc:answer', ({ roomId, sdp } = {}) => {
    const id = String(roomId || '');
    if (!watching.has(id) || !sdp) return;
    notifyTransmitter(io, id, 'webrtc:answer', { roomId: id, viewerId: socket.id, sdp });
  });

  socket.on('webrtc:ice', ({ roomId, candidate } = {}) => {
    const id = String(roomId || '');
    if (!watching.has(id) || !candidate) return;
    notifyTransmitter(io, id, 'webrtc:ice', { roomId: id, viewerId: socket.id, candidate });
  });

  socket.on('webrtc:request-renegotiate', ({ roomId } = {}) => {
    const id = String(roomId || '');
    if (!watching.has(id)) return;
    handleRenegotiate(io, socket, id, socket.id);
  });

  socket.on('quality:request', ({ roomId, level } = {}) => {
    const id = String(roomId || '');
    if (!watching.has(id)) return;
    if (!Quality.isValid(level) || level === Quality.AUTO) return;
    notifyTransmitter(io, id, 'quality:request', { roomId: id, viewerId: socket.id, level });
  });

  socket.on('disconnect', () => {
    for (const id of [...watching]) stopWatching(io, socket, watching, id);
  });
}

function stopWatching(io, socket, watching, roomId) {
  if (!watching.delete(roomId)) return;
  socket.leave(roomChannel(roomId));
  liveState.removeViewer(roomId, socket.id);
  limiter.clear(roomId, socket.id);
  notifyTransmitter(io, roomId, 'viewer:left', { roomId, viewerId: socket.id });
}

function handleRenegotiate(io, socket, roomId, viewerId) {
  const result = limiter.register(roomId, viewerId);
  if (!result.allowed) {
    // Passou do limite: em vez de repassar de novo (loop infinito), sinaliza que
    // essa conexao especifica precisa de intervencao manual.
    socket.emit('webrtc:renegotiate-exhausted', { roomId, attempts: result.attempts });
    notifyTransmitter(io, roomId, 'webrtc:renegotiate-exhausted', { roomId, viewerId });
    return;
  }
  notifyTransmitter(io, roomId, 'webrtc:request-renegotiate', {
    roomId,
    viewerId,
    attempt: result.attempts,
  });
}

function notifyTransmitter(io, roomId, event, payload) {
  const transmitterSocketId = liveState.getTransmitterSocketId(roomId);
  if (!transmitterSocketId) return false;
  io.to(transmitterSocketId).emit(event, payload);
  return true;
}

module.exports = { attachSignaling, ADMIN_ROOM, ADMIN_MONITOR_LABEL, HIDDEN_PEER_LABEL };
