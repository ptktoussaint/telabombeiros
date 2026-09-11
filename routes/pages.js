'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');

const { identifyTransmitter, identifyViewer } = require('./rooms');
const { isTransmitterOf, isViewerOf, isAdmin, getRole } = require('../lib/sessionRoles');
const { buildIceServers } = require('../lib/turn');
const { requireAnyRole } = require('../lib/authz');
const Room = require('../models/Room');
const { getBrandingSafe, mergeBranding } = require('../lib/branding');
const { buildSiteCard, buildInviteCard } = require('../lib/socialCard');
const { baseUrl } = require('../lib/urls');

const router = express.Router();
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function sendPage(res, file) {
  res.sendFile(path.join(PUBLIC_DIR, file));
}

const templates = {};

function readTemplate(file) {
  if (!templates[file]) {
    templates[file] = fs.readFileSync(path.join(PUBLIC_DIR, file), 'utf8');
  }
  return templates[file];
}

function sendWithCard(res, file, cardTags) {
  return res.type('html').send(readTemplate(file).replace('<!--CARTAO-->', cardTags));
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

router.get('/', async (req, res, next) => {
  try {
    const branding = await getBrandingSafe();
    return sendWithCard(res, 'index.html', buildSiteCard(branding, baseUrl(req)));
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
    const negado = () => res.status(403).sendFile(path.join(PUBLIC_DIR, 'sem-acesso.html'));
    const token = req.query.t;
    let room = null;

    if (token) {
      room = await identifyViewer(req, req.params.roomId, token);
      if (!room) return negado();
      await saveSession(req);
    } else {
      if (!isViewerOf(req.session, req.params.roomId)) return negado();
      room = await Room.findById(req.params.roomId).catch(() => null);
      if (!room || room.status !== 'active') return negado();
    }

    // Sem redirecionamento aqui de proposito: o robo que monta a previa do link nao
    // carrega cookie, entao ao seguir o redirecionamento cairia na pagina de sem acesso
    // e nao leria o cartao. O token sai da barra de enderecos no proprio navegador.
    const global = await getBrandingSafe();
    const branding = mergeBranding(global, room.branding);
    const base = baseUrl(req);

    return sendWithCard(
      res,
      'assistir.html',
      buildInviteCard({
        roomLabel: room.roomLabel,
        inviteLabel: req.session.viewerLabel,
        branding,
        baseUrl: base,
        url: `${base}/v/${room._id}`,
      })
    );
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
