'use strict';

const mongoose = require('mongoose');

const viewerTokenSchema = new mongoose.Schema(
  {
    label: { type: String, default: 'Convite' },
    tokenHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
  },
  { _id: true }
);

// Guarda apenas o que o dono da sala sobrescreveu; o resto vem da identidade do site.
const roomBrandingSchema = new mongoose.Schema(
  {
    colors: { type: Object, default: () => ({}) },
    logoUrl: { type: String, default: '' },
    backgroundUrl: { type: String, default: '' },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema({
  roomLabel: { type: String, required: true, trim: true, maxlength: 80 },
  // Somente o hash sha256 do token e persistido - o valor puro so existe no link.
  transmitterTokenHash: { type: String, required: true },
  viewerTokens: { type: [viewerTokenSchema], default: [] },
  branding: { type: roomBrandingSchema, default: () => ({}) },
  status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
  createdAt: { type: Date, default: Date.now },
  // Ultima vez que o host esteve conectado. Fica no banco (e nao so na memoria)
  // porque a hospedagem hiberna e reinicia: alarme em memoria se perde, isto nao.
  lastHostSeenAt: { type: Date, default: Date.now, index: true },
  closedAt: { type: Date, default: null },
});

roomSchema.methods.activeViewerTokens = function activeViewerTokens() {
  return this.viewerTokens.filter((token) => !token.revokedAt);
};

module.exports = mongoose.model('Room', roomSchema);
