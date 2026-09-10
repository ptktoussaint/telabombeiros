'use strict';

const ROLES = ['admin', 'transmitter', 'viewer'];

// Bug historico deste tipo de sistema: a mesma sessao (mesmo navegador) representando
// dois papeis ao mesmo tempo faz o servidor confundir quem e quem e a transmissao
// quebra em silencio. Por isso toda identificacao limpa os outros papeis antes de setar.
function clearRoles(session) {
  if (!session) return;
  delete session.role;
  delete session.roomId;
  delete session.viewerTokenId;
  delete session.viewerLabel;
  delete session.adminUsername;
  delete session.transmitterLabel;
}

function setRole(session, role, data = {}) {
  if (!session) throw new Error('sessao ausente');
  if (!ROLES.includes(role)) throw new Error(`papel invalido: ${role}`);
  clearRoles(session);
  session.role = role;
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) session[key] = value;
  }
  return session;
}

// O papel NUNCA vem do cliente: e sempre lido da sessao no servidor.
function getRole(session) {
  if (!session || !ROLES.includes(session.role)) return null;
  return session.role;
}

function isAdmin(session) {
  return getRole(session) === 'admin';
}

function isTransmitterOf(session, roomId) {
  return getRole(session) === 'transmitter' && String(session.roomId) === String(roomId);
}

function isViewerOf(session, roomId) {
  return getRole(session) === 'viewer' && String(session.roomId) === String(roomId);
}

module.exports = { ROLES, clearRoles, setRole, getRole, isAdmin, isTransmitterOf, isViewerOf };
