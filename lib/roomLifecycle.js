'use strict';

const Room = require('../models/Room');
const { liveState } = require('./liveState');
const { getRole } = require('./sessionRoles');

// Quando o host cai, a sala nao acaba na hora: um refresh da pagina dele ou uma
// oscilacao de internet derruba o socket por poucos segundos. Sem essa folga, um
// tropeco de rede encerraria a transmissao de todo mundo sem volta.
const GRACE_MS = 20000;

const timers = new Map();

function channel(roomId) {
  return `room:${roomId}`;
}

function cancelScheduledClose(roomId) {
  const id = String(roomId);
  const timer = timers.get(id);
  if (!timer) return false;
  clearTimeout(timer);
  timers.delete(id);
  return true;
}

function scheduleCloseAfterHostLeft(io, roomId, graceMs = GRACE_MS) {
  const id = String(roomId);
  cancelScheduledClose(id);
  const timer = setTimeout(() => {
    timers.delete(id);
    // O host pode ter voltado dentro da folga; nesse caso nao ha nada a fazer.
    if (liveState.getTransmitterSocketId(id)) return;
    closeRoom(io, id, 'host-left').catch(() => {});
  }, graceMs);
  if (typeof timer.unref === 'function') timer.unref();
  timers.set(id, timer);
  return timer;
}

function disconnectRoomSockets(io, roomId) {
  const ids = io.sockets.adapter.rooms.get(channel(roomId));
  if (!ids) return 0;
  let derrubados = 0;
  for (const socketId of [...ids]) {
    const socket = io.sockets.sockets.get(socketId);
    if (!socket) continue;
    // O socket do admin atende varias salas de uma vez: derrubar ele aqui cortaria
    // o monitoramento de todas as outras. Ele so sai deste canal.
    if (getRole(socket.request.session) === 'admin') {
      socket.leave(channel(roomId));
      continue;
    }
    socket.disconnect(true);
    derrubados += 1;
  }
  return derrubados;
}

async function closeRoom(io, roomId, reason = 'host-ended') {
  const id = String(roomId);
  cancelScheduledClose(id);

  const room = await Room.findById(id).catch(() => null);
  if (room && room.status !== 'closed') {
    room.status = 'closed';
    room.closedAt = new Date();
    await room.save();
  }

  if (io) {
    io.to(channel(id)).emit('room:closed', { roomId: id, reason });
    // Folga curta para o aviso chegar antes das conexoes cairem.
    setTimeout(() => disconnectRoomSockets(io, id), 150).unref?.();
  }

  liveState.dropRoom(id);
  return room;
}

module.exports = {
  GRACE_MS,
  closeRoom,
  scheduleCloseAfterHostLeft,
  cancelScheduledClose,
  disconnectRoomSockets,
};
