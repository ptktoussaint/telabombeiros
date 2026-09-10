'use strict';

const config = require('./config');

function baseUrl(req) {
  if (config.publicUrl) return config.publicUrl;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${proto}://${host}`;
}

function transmitterUrl(req, roomId, token) {
  return `${baseUrl(req)}/t/${roomId}?t=${encodeURIComponent(token)}`;
}

function inviteUrl(req, roomId, token) {
  return `${baseUrl(req)}/v/${roomId}?t=${encodeURIComponent(token)}`;
}

module.exports = { baseUrl, transmitterUrl, inviteUrl };
