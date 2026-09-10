'use strict';

const { getRole, isAdmin, isTransmitterOf, isViewerOf } = require('./sessionRoles');

function requireAdmin(req, res, next) {
  if (!isAdmin(req.session)) {
    return res.status(401).json({ error: 'Acesso restrito ao administrador.' });
  }
  return next();
}

// O papel e sempre resolvido a partir da sessao; o roomId vem da rota, nunca do corpo.
function requireTransmitter(req, res, next) {
  const roomId = req.params.roomId;
  if (!isTransmitterOf(req.session, roomId)) {
    return res.status(403).json({ error: 'Voce nao e o transmissor desta sala.' });
  }
  return next();
}

function requireRoomAccess(req, res, next) {
  const roomId = req.params.roomId;
  if (isAdmin(req.session) || isTransmitterOf(req.session, roomId) || isViewerOf(req.session, roomId)) {
    return next();
  }
  return res.status(403).json({ error: 'Sem acesso a esta sala.' });
}

function requireAnyRole(req, res, next) {
  if (!getRole(req.session)) {
    return res.status(401).json({ error: 'Sessao nao identificada.' });
  }
  return next();
}

module.exports = { requireAdmin, requireTransmitter, requireRoomAccess, requireAnyRole };
