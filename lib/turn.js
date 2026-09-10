'use strict';

const crypto = require('crypto');

const DEFAULT_STUN = 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302';

function splitUrls(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}

// Credencial efemera do coturn ("use-auth-secret"):
// username = <timestamp de expiracao>:<identificador>, credencial = base64(HMAC-SHA1(segredo, username)).
function buildHmacCredential(secret, ttlSeconds, identity, now = Date.now()) {
  const expiry = Math.floor(now / 1000) + Number(ttlSeconds || 3600);
  const username = `${expiry}:${identity || 'user'}`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential, expiresAt: expiry * 1000 };
}

// Suporta os dois formatos porque cada provedor entrega de um jeito:
// TURN_SECRET (HMAC efemero) ou TURN_USERNAME/TURN_CREDENTIAL (usuario e senha fixos).
function buildIceServers(env = process.env, { identity = 'user', now = Date.now() } = {}) {
  const iceServers = [];
  const stunUrls = splitUrls(env.STUN_URLS || DEFAULT_STUN);
  if (stunUrls.length) iceServers.push({ urls: stunUrls });

  const turnUrls = splitUrls(env.TURN_URLS);
  if (turnUrls.length) {
    if (env.TURN_SECRET) {
      const { username, credential } = buildHmacCredential(
        env.TURN_SECRET,
        env.TURN_TTL,
        identity,
        now
      );
      iceServers.push({ urls: turnUrls, username, credential });
    } else if (env.TURN_USERNAME && env.TURN_CREDENTIAL) {
      iceServers.push({
        urls: turnUrls,
        username: env.TURN_USERNAME,
        credential: env.TURN_CREDENTIAL,
      });
    }
  }

  return iceServers;
}

function hasTurn(env = process.env) {
  const turnUrls = splitUrls(env.TURN_URLS);
  if (!turnUrls.length) return false;
  return Boolean(env.TURN_SECRET || (env.TURN_USERNAME && env.TURN_CREDENTIAL));
}

function warnIfNoTurn(env = process.env, logger = console) {
  if (hasTurn(env)) return false;
  logger.warn(
    '[turn] Nenhum servidor TURN configurado. Transmissores e espectadores atras de NAT/firewall ' +
      'restritivo provavelmente NAO vao conseguir conectar. Configure TURN_URLS + TURN_SECRET ' +
      'ou TURN_URLS + TURN_USERNAME/TURN_CREDENTIAL.'
  );
  return true;
}

module.exports = { buildIceServers, buildHmacCredential, hasTurn, warnIfNoTurn, splitUrls };
