'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const Room = require('../models/Room');
const config = require('../lib/config');
const { setRole, clearRoles, isAdmin } = require('../lib/sessionRoles');
const { requireAdmin } = require('../lib/authz');
const { liveState } = require('../lib/liveState');
const {
  getBranding,
  serializeBranding,
  sanitizeColors,
  sanitizeMediaUrl,
  sanitizeEffects,
} = require('../lib/branding');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const ALLOWED_UPLOAD = /^(image\/(png|jpe?g|gif|webp|svg\+xml)|video\/(mp4|webm|ogg))$/;

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_UPLOAD.test(file.mimetype)) return cb(new Error('Tipo de arquivo nao permitido.'));
    return cb(null, true);
  },
});

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkAdminCredentials(username, password) {
  if (!safeEqual(username || '', config.admin.username)) return false;
  if (config.admin.passwordHash) return bcrypt.compareSync(String(password || ''), config.admin.passwordHash);
  return safeEqual(password || '', config.admin.password);
}

router.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!checkAdminCredentials(username, password)) {
    return res.status(401).json({ error: 'Usuario ou senha invalidos.' });
  }
  // Login de admin tambem limpa qualquer papel anterior desta sessao.
  setRole(req.session, 'admin', { adminUsername: config.admin.username });
  return res.json({ ok: true, username: config.admin.username });
});

router.post('/api/admin/logout', (req, res) => {
  clearRoles(req.session);
  return res.json({ ok: true });
});

router.get('/api/admin/session', (req, res) => {
  return res.json({ admin: isAdmin(req.session), username: req.session.adminUsername || null });
});

router.get('/api/admin/rooms', requireAdmin, async (req, res, next) => {
  try {
    const includeClosed = req.query.includeClosed === '1';
    const filter = includeClosed ? {} : { status: 'active' };
    const rooms = await Room.find(filter).sort({ createdAt: -1 }).limit(200);
    const payload = rooms.map((room) => {
      const id = String(room._id);
      return {
        roomId: id,
        roomLabel: room.roomLabel,
        status: room.status,
        createdAt: room.createdAt,
        closedAt: room.closedAt,
        invites: room.viewerTokens.map((token) => ({
          id: String(token._id),
          label: token.label,
          createdAt: token.createdAt,
          revokedAt: token.revokedAt,
          active: !token.revokedAt,
        })),
        live: liveState.serializeRoom(id),
      };
    });
    return res.json({ rooms: payload });
  } catch (err) {
    return next(err);
  }
});

router.get('/api/admin/live', requireAdmin, (req, res) => {
  return res.json({ rooms: liveState.snapshot() });
});

router.get('/api/branding', async (req, res, next) => {
  try {
    const doc = await getBranding();
    return res.json(serializeBranding(doc));
  } catch (err) {
    return next(err);
  }
});

router.put('/api/admin/branding', requireAdmin, async (req, res, next) => {
  try {
    const doc = await getBranding();
    const body = req.body || {};

    if (typeof body.siteName === 'string') doc.siteName = body.siteName.trim().slice(0, 60);
    if (typeof body.tagline === 'string') doc.tagline = body.tagline.trim().slice(0, 120);
    doc.colors = sanitizeColors(body.colors, doc.colors);

    for (const field of ['logoUrl', 'backgroundUrl', 'videoUrl']) {
      if (body[field] === undefined) continue;
      const value = sanitizeMediaUrl(body[field]);
      if (value === null) return res.status(400).json({ error: `Link invalido em ${field}.` });
      doc[field] = value;
    }

    if (body.effects && typeof body.effects === 'object') {
      doc.effects = sanitizeEffects(body.effects, doc.effects);
    }

    doc.updatedAt = new Date();
    doc.markModified('colors');
    doc.markModified('effects');
    await doc.save();

    req.app.get('io')?.emit('branding:updated', serializeBranding(doc));
    return res.json(serializeBranding(doc));
  } catch (err) {
    return next(err);
  }
});

router.post('/api/admin/branding/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
  return res.json({ url: `/uploads/${req.file.filename}` });
});

module.exports = { router, checkAdminCredentials };
