'use strict';

const { EventEmitter } = require('events');

const STREAM_STATUSES = [
  'awaiting',
  'capturing',
  'connecting',
  'negotiating',
  'live',
  'reconnecting',
  'interrupted',
  'error',
];

// Estado de presenca/transmissao de AGORA - nao e historico.
// Fica so na memoria do processo de proposito: um restart pode apagar sem prejuizo,
// o que precisa sobreviver vai para o Mongo.
class LiveState extends EventEmitter {
  constructor() {
    super();
    this.rooms = new Map();
  }

  _ensure(roomId, roomLabel) {
    const id = String(roomId);
    let room = this.rooms.get(id);
    if (!room) {
      room = {
        roomId: id,
        roomLabel: roomLabel || '',
        transmitterOnline: false,
        transmitterSocketId: null,
        streamStatus: 'awaiting',
        startedAt: null,
        updatedAt: Date.now(),
        viewers: new Map(),
      };
      this.rooms.set(id, room);
    }
    if (roomLabel) room.roomLabel = roomLabel;
    return room;
  }

  _touch(room) {
    room.updatedAt = Date.now();
    this.emit('change', this.serializeRoom(room.roomId));
  }

  registerRoom(roomId, roomLabel) {
    const room = this._ensure(roomId, roomLabel);
    this._touch(room);
    return room;
  }

  transmitterConnected(roomId, socketId, roomLabel) {
    const room = this._ensure(roomId, roomLabel);
    room.transmitterOnline = true;
    room.transmitterSocketId = socketId;
    if (!room.startedAt) room.startedAt = Date.now();
    this._touch(room);
    return room;
  }

  transmitterDisconnected(roomId, socketId) {
    const room = this.rooms.get(String(roomId));
    if (!room) return null;
    // Ignora a desconexao de um socket antigo que ja foi substituido por outro.
    if (socketId && room.transmitterSocketId && room.transmitterSocketId !== socketId) return room;
    room.transmitterOnline = false;
    room.transmitterSocketId = null;
    room.streamStatus = 'interrupted';
    this._touch(room);
    return room;
  }

  setStreamStatus(roomId, status) {
    const room = this.rooms.get(String(roomId));
    if (!room) return null;
    if (!STREAM_STATUSES.includes(status)) return room;
    room.streamStatus = status;
    this._touch(room);
    return room;
  }

  addViewer(roomId, viewer, roomLabel) {
    const room = this._ensure(roomId, roomLabel);
    room.viewers.set(String(viewer.viewerId), {
      viewerId: String(viewer.viewerId),
      label: viewer.label || 'Espectador',
      isAdminMonitor: Boolean(viewer.isAdminMonitor),
      joinedAt: Date.now(),
    });
    this._touch(room);
    return room;
  }

  removeViewer(roomId, viewerId) {
    const room = this.rooms.get(String(roomId));
    if (!room) return null;
    if (!room.viewers.delete(String(viewerId))) return room;
    this._touch(room);
    return room;
  }

  getViewer(roomId, viewerId) {
    const room = this.rooms.get(String(roomId));
    if (!room) return null;
    return room.viewers.get(String(viewerId)) || null;
  }

  getTransmitterSocketId(roomId) {
    const room = this.rooms.get(String(roomId));
    return room && room.transmitterOnline ? room.transmitterSocketId : null;
  }

  // Um mesmo socket de admin pode estar assistindo varias salas ao mesmo tempo.
  roomsWatchedByViewer(viewerId) {
    const ids = [];
    for (const room of this.rooms.values()) {
      if (room.viewers.has(String(viewerId))) ids.push(room.roomId);
    }
    return ids;
  }

  // O admin monitorando nao conta como espectador, senao ele mesmo infla o numero.
  viewerCount(roomId) {
    const room = this.rooms.get(String(roomId));
    if (!room) return 0;
    let total = 0;
    for (const viewer of room.viewers.values()) {
      if (!viewer.isAdminMonitor) total += 1;
    }
    return total;
  }

  serializeRoom(roomId) {
    const room = this.rooms.get(String(roomId));
    if (!room) return null;
    const viewers = [...room.viewers.values()].filter((v) => !v.isAdminMonitor);
    return {
      roomId: room.roomId,
      roomLabel: room.roomLabel,
      transmitterOnline: room.transmitterOnline,
      streamStatus: room.streamStatus,
      startedAt: room.startedAt,
      updatedAt: room.updatedAt,
      viewerCount: viewers.length,
      monitorCount: room.viewers.size - viewers.length,
      viewers: viewers.map((v) => ({ viewerId: v.viewerId, label: v.label, joinedAt: v.joinedAt })),
    };
  }

  snapshot() {
    return [...this.rooms.keys()].map((id) => this.serializeRoom(id));
  }

  dropRoom(roomId) {
    const id = String(roomId);
    if (!this.rooms.has(id)) return false;
    this.rooms.delete(id);
    this.emit('change', { roomId: id, removed: true });
    return true;
  }

  reset() {
    this.rooms.clear();
  }
}

module.exports = { LiveState, STREAM_STATUSES, liveState: new LiveState() };
