'use strict';

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 2 * 60 * 1000;

// Um par transmissor<->espectador travado pode pedir renegociacao sem parar.
// Sem freio isso vira loop infinito, entao depois de N tentativas na janela o servidor
// para de repassar e sinaliza "precisa de intervencao manual".
class RenegotiationLimiter {
  constructor({ maxAttempts = DEFAULT_MAX_ATTEMPTS, windowMs = DEFAULT_WINDOW_MS } = {}) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowMs;
    this.attempts = new Map();
  }

  static pairKey(roomId, viewerId) {
    return `${roomId}::${viewerId}`;
  }

  register(roomId, viewerId, now = Date.now()) {
    const key = RenegotiationLimiter.pairKey(roomId, viewerId);
    const previous = (this.attempts.get(key) || []).filter((ts) => now - ts < this.windowMs);
    if (previous.length >= this.maxAttempts) {
      this.attempts.set(key, previous);
      const retryAfterMs = this.windowMs - (now - previous[0]);
      return { allowed: false, attempts: previous.length, retryAfterMs };
    }
    previous.push(now);
    this.attempts.set(key, previous);
    return { allowed: true, attempts: previous.length, retryAfterMs: 0 };
  }

  clear(roomId, viewerId) {
    this.attempts.delete(RenegotiationLimiter.pairKey(roomId, viewerId));
  }

  clearRoom(roomId) {
    const prefix = `${roomId}::`;
    for (const key of this.attempts.keys()) {
      if (key.startsWith(prefix)) this.attempts.delete(key);
    }
  }
}

module.exports = {
  RenegotiationLimiter,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_WINDOW_MS,
  limiter: new RenegotiationLimiter(),
};
