'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');

const { identifyTransmitter, identifyViewer } = require('./rooms');
const { isTransmitterOf, isViewerOf, isAdmin, getRole } = require('../lib/sessionRoles');
const { buildIceServers } = require('../lib/turn');
const { requireAnyRole } = require('../lib/authz');
const { getBrandingSafe } = require('../lib/branding');
const { buildSocialCard } = require('../lib/socialCard');
const { baseUrl } = require('../lib/urls');

const router = express.Router();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function sendPage(res, file) {
  res.sendFile(path.join(PUBLIC_DIR, file));
}

let indexTemplate = null;

function readIndexTemplate() {
  if (!indexTemplate) {
    indexTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  }
  return indexTemplate;
}

router.get('/', async (req, res, next) => {
  try {
    const branding = await getBrandingSafe();
    const html = readIndexTemplate().replace(
      '<!--CARTAO-->',
      buildSocialCard(branding, baseUrl(req))
    );
    return res.type('html').send(html);
  } catch (err) {
    return next(err);
  }
});
router.get('/admin', (req, res) => sendPage(res, 'admin/index.html'));
router.get('/admin/login', (req, res) => sendPage(res, 'admin/login.html'));

// O token viaja na URL apenas no primeiro acesso: depois de validado a sessao assume o papel
// e o navegador e redirecionado para a URL limpa (o token nao fica no historico da aba).
router.get('/t/:roomId', async (req, res, next) => {
  try {
    const token = req.query.t;
    if (token) {
      const room = await identifyTransmitter(req, req.params.roomId, token);
      if (!room) return res.status(403).sendFile(path.join(PUBLIC_DIR, 'sem-acesso.html'));
      return req.session.save(() => res.redirect(`/t/${req.params.roomId}`));
    }
    if (!isTransmitterOf(req.session, req.params.roomId)) {
      return res.status(403).sendFile(path.join(PUBLIC_DIR, 'sem-acesso.html'));
    }
    return sendPage(res, 'transmitir.html');
  } catch (err) {
    return next(err);
  }
});

router.get('/v/:roomId', async (req, res, next) => {
  try {
    const token = req.query.t;
    if (token) {
      const room = await identifyViewer(req, req.params.roomId, token);
      if (!room) return res.status(403).sendFile(path.join(PUBLIC_DIR, 'sem-acesso.html'));
      return req.session.save(() => res.redirect(`/v/${req.params.roomId}`));
    }
    if (!isViewerOf(req.session, req.params.roomId)) {
      return res.status(403).sendFile(path.join(PUBLIC_DIR, 'sem-acesso.html'));
    }
    return sendPage(res, 'assistir.html');
  } catch (err) {
    return next(err);
  }
});

// Credenciais TURN nunca ficam no HTML estatico: saem daqui, geradas na hora,
// e so para quem tem sessao identificada.
router.get('/api/ice-servers', requireAnyRole, (req, res) => {
  const identity = `${getRole(req.session)}-${req.session.roomId || req.sessionID}`;
  return res.json({ iceServers: buildIceServers(process.env, { identity }) });
});

router.get('/api/session', (req, res) => {
  return res.json({
    role: getRole(req.session),
    roomId: req.session.roomId || null,
    label: req.session.viewerLabel || req.session.transmitterLabel || null,
    admin: isAdmin(req.session),
  });
});

module.exports = router;
