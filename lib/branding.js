'use strict';

const Branding = require('../models/Branding');

const COLOR_KEYS = ['brand', 'brandDeep', 'ember', 'ink', 'surface', 'text', 'muted'];
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function sanitizeColors(input, current = {}) {
  const colors = { ...current };
  if (!input || typeof input !== 'object') return colors;
  for (const key of COLOR_KEYS) {
    const value = input[key];
    if (typeof value === 'string' && HEX.test(value.trim())) colors[key] = value.trim();
  }
  return colors;
}

// Aceita tanto caminho de arquivo enviado (/uploads/...) quanto link externo colado.
// Link externo existe porque o disco do Render e efemero: arquivo enviado some a cada deploy.
function sanitizeMediaUrl(value) {
  if (value === undefined || value === null) return undefined;
  const url = String(value).trim();
  if (!url) return '';
  if (url.startsWith('/uploads/')) return url;
  if (/^https?:\/\/\S+$/i.test(url)) return url;
  return null;
}

async function getBranding() {
  let doc = await Branding.findOne({ key: 'default' });
  if (!doc) doc = await Branding.create({ key: 'default' });
  return doc;
}

function serializeBranding(doc) {
  return {
    siteName: doc.siteName,
    tagline: doc.tagline,
    colors: doc.colors,
    logoUrl: doc.logoUrl,
    backgroundUrl: doc.backgroundUrl,
    videoUrl: doc.videoUrl,
    effects: doc.effects,
    updatedAt: doc.updatedAt,
  };
}

module.exports = { getBranding, serializeBranding, sanitizeColors, sanitizeMediaUrl, COLOR_KEYS };
