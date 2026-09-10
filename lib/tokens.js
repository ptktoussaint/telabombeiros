'use strict';

const crypto = require('crypto');

// Tokens sao tratados como senha: o valor puro so existe no momento da criacao,
// no banco fica apenas o hash. Perder o link exige gerar um novo.
function generateToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

// Comparacao em tempo constante para nao vazar informacao pelo tempo de resposta.
function tokenMatches(token, expectedHash) {
  if (!token || !expectedHash) return false;
  const candidate = Buffer.from(hashToken(token), 'utf8');
  const expected = Buffer.from(String(expectedHash), 'utf8');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

module.exports = { generateToken, hashToken, tokenMatches };
