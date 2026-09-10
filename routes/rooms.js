'use strict';

const express = require('express');
const Room = require('../models/Room');
const { generateToken, hashToken, tokenMatches } = require('../lib/tokens');
const { setRole, isAdmin, isTransmitterOf } = require('../lib/sessionRoles');
const { requireTransmitter } = require('../lib/authz');
const { transmitterUrl, inviteUrl } = require('../lib/urls');
const { liveState } = require('../lib/liveState');

const router = express.Router();

function serializeInvite(token) {
  return {
    id: String(token._id),
    label: token.label,
    createdAt: token.createdAt,
    revokedAt: token.revokedAt,
    active: !token.revokedAt,
  };
}

// Abrir sala: qualquer pessoa, sem cadastro. Devolve os links uma unica vez.
router.post('/api/rooms', async (req, res, next) => {
  try {
    const roomLabel = String(req.body.roomLabel || '').trim();
    if (!roomLabel) return res.status(400).json({ error: 'Informe um nome para a sala.' });
    if (roomLabel.length > 80) return res.status(400).json({ error: 'Nome muito longo (max. 80).' });

    const transmitterToken = generateToken();
    const firstInviteToken = generateToken();

    const room = await Room.create({
      roomLabel,
      transmitterTokenHash: hashToken(transmitterToken),
      viewerTokens: [{ label: 'Convite principal', tokenHash: hashToken(firstInviteToken) }],
      status: 'active',
    });

    setRole(req.session, 'transmitter', {
      roomId: String(room._id),
      transmitterLabel: roomLabel,
    });

    liveState.registerRoom(String(room._id), roomLabel);

    return res.status(201).json({
      roomId: String(room._id),
      roomLabel: room.roomLabel,
      transmitterUrl: transmitterUrl(req, room._id, transmitterToken),
      invite: {
        ...serializeInvite(room.viewerTokens[0]),
        url: inviteUrl(req, room._id, firstInviteToken),
      },
    });
  } catch (err) {
    return next(err);
  }
});

// Estado da sala para a pagina do transmissor.
router.get('/api/rooms/:roomId', requireTransmitter, async (req, res, next) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Sala nao encontrada.' });
    return res.json({
      roomId: String(room._id),
      roomLabel: room.roomLabel,
      status: room.status,
      createdAt: room.createdAt,
      invites: room.viewerTokens.map(serializeInvite),
      live: liveState.serializeRoom(String(room._id)),
    });
  } catch (err) {
    return next(err);
  }
});

// Gera um novo link de convite. O valor puro so aparece nesta resposta.
router.post('/api/rooms/:roomId/invites', requireTransmitter, async (req, res, next) => {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Sala nao encontrada.' });
    if (room.status !== 'active') return res.status(409).json({ error: 'Sala encerrada.' });

    const label = String(req.body.label || '').trim() || `Convite ${room.viewerTokens.length + 1}`;
    const token = generateToken();
    room.viewerTokens.push({ label, tokenHash: hashToken(token) });
    await room.save();

    const created = room.viewerTokens[room.viewerTokens.length - 1];
    return res.status(201).json({
      ...serializeInvite(created),
      url: inviteUrl(req, room._id, token),
    });
  } catch (err) {
    return next(err);
  }
});

async function revokeInvite(req, res, next) {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Sala nao encontrada.' });
    const invite = room.viewerTokens.id(req.params.inviteId);
    if (!invite) return res.status(404).json({ error: 'Convite nao encontrado.' });
    if (!invite.revokedAt) {
      invite.revokedAt = new Date();
      await room.save();
    }
    return res.json(serializeInvite(invite));
  } catch (err) {
    return next(err);
  }
}

router.post('/api/rooms/:roomId/invites/:inviteId/revoke', (req, res, next) => {
  if (!isAdmin(req.session) && !isTransmitterOf(req.session, req.params.roomId)) {
    return res.status(403).json({ error: 'Sem permissao para revogar este convite.' });
  }
  return revokeInvite(req, res, next);
});

router.post('/api/rooms/:roomId/close', (req, res, next) => {
  if (!isAdmin(req.session) && !isTransmitterOf(req.session, req.params.roomId)) {
    return res.status(403).json({ error: 'Sem permissao para encerrar esta sala.' });
  }
  return closeRoom(req, res, next);
});

async function closeRoom(req, res, next) {
  try {
    const room = await Room.findById(req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Sala nao encontrada.' });
    if (room.status !== 'closed') {
      room.status = 'closed';
      room.closedAt = new Date();
      await room.save();
    }
    req.app.get('io')?.to(`room:${room._id}`).emit('room:closed', { roomId: String(room._id) });
    liveState.dropRoom(String(room._id));
    return res.json({ roomId: String(room._id), status: room.status });
  } catch (err) {
    return next(err);
  }
}

// Validacao do link: acontece no GET da pagina e ja troca o papel da sessao.
async function identifyTransmitter(req, roomId, token) {
  const room = await Room.findById(roomId).catch(() => null);
  if (!room || room.status !== 'active') return null;
  if (!tokenMatches(token, room.transmitterTokenHash)) return null;
  setRole(req.session, 'transmitter', {
    roomId: String(room._id),
    transmitterLabel: room.roomLabel,
  });
  return room;
}

async function identifyViewer(req, roomId, token) {
  const room = await Room.findById(roomId).catch(() => null);
  if (!room || room.status !== 'active') return null;
  const invite = room.viewerTokens.find((t) => !t.revokedAt && tokenMatches(token, t.tokenHash));
  if (!invite) return null;
  setRole(req.session, 'viewer', {
    roomId: String(room._id),
    viewerTokenId: String(invite._id),
    viewerLabel: invite.label,
  });
  return room;
}

module.exports = { router, identifyTransmitter, identifyViewer, closeRoom, serializeInvite };
