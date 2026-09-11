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

// A identidade da sala nao substitui a do site: ela sobrepoe so os campos preenchidos.
// Campo vazio na sala significa "usar o do site", e e assim que o botao de restaurar funciona.
function mergeBranding(globalDoc, roomBranding) {
  const base = serializeBranding(globalDoc);
  const room = roomBranding || {};
  return {
    ...base,
    colors: Object.assign({}, base.colors, room.colors || {}),
    logoUrl: room.logoUrl || base.logoUrl,
    backgroundUrl: room.backgroundUrl || base.backgroundUrl,
  };
}

function sanitizeSparkRate(value, current) {
  // Ausencia de valor nao e zero: sem isso um campo vazio desligaria as fagulhas
  // sozinho, porque Number(null) e Number('') valem 0.
  if (value === undefined || value === null || value === '') return current;
  const n = Number(value);
  if (!Number.isFinite(n)) return current;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function sanitizeEffects(input, current = {}) {
  if (!input || typeof input !== 'object') return current;
  return {
    spotlight: input.spotlight !== false,
    sparks: input.sparks !== false,
    sparkRate: sanitizeSparkRate(input.sparkRate, current.sparkRate === undefined ? 20 : current.sparkRate),
  };
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

module.exports = {
  getBranding,
  serializeBranding,
  mergeBranding,
  sanitizeColors,
  sanitizeMediaUrl,
  sanitizeEffects,
  sanitizeSparkRate,
  COLOR_KEYS,
};
