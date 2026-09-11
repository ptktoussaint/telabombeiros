'use strict';

const mongoose = require('mongoose');

// Documento unico (key: 'default') com a identidade visual editavel pelo admin.
const brandingSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  siteName: { type: String, default: 'Tela Bombeiros' },
  tagline: { type: String, default: 'Transmissao de tela ao vivo' },
  colors: {
    type: Object,
    default: () => ({
      brand: '#e11d1d',
      brandDeep: '#7f1010',
      ember: '#ff8a1f',
      ink: '#0b0b0d',
      surface: '#141418',
      text: '#f5f5f7',
      muted: '#a1a1aa',
    }),
  },
  logoUrl: { type: String, default: '' },
  backgroundUrl: { type: String, default: '' },
  videoUrl: { type: String, default: '' },
  shareImageUrl: { type: String, default: '' },
  effects: {
    type: Object,
    default: () => ({ spotlight: true, sparks: true }),
  },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Branding', brandingSchema);
