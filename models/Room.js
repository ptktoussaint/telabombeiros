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

const roomSchema = new mongoose.Schema({
  roomLabel: { type: String, required: true, trim: true, maxlength: 80 },
  // Somente o hash sha256 do token e persistido - o valor puro so existe no link.
  transmitterTokenHash: { type: String, required: true },
  viewerTokens: { type: [viewerTokenSchema], default: [] },
  status: { type: String, enum: ['active', 'closed'], default: 'active', index: true },
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
});

roomSchema.methods.activeViewerTokens = function activeViewerTokens() {
  return this.viewerTokens.filter((token) => !token.revokedAt);
};

module.exports = mongoose.model('Room', roomSchema);
