(function () {
  'use strict';

  var WATCHDOG_INTERVAL_MS = 5000;
  var STALE_CHECKS_BEFORE_RENEGOTIATE = 3;

  function fetchIceServers() {
    return fetch('/api/ice-servers', { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('Nao foi possivel obter os servidores ICE.');
        return res.json();
      })
      .then(function (data) {
        return data.iceServers || [];
      });
  }

  // Candidates que chegam antes da remoteDescription estar setada NUNCA sao descartados:
  // ficam nesta fila e sao aplicados assim que a descricao remota existe.
  function IceQueue() {
    this.pending = [];
  }

  IceQueue.prototype.push = function (candidate) {
    this.pending.push(candidate);
  };

  IceQueue.prototype.flush = function (pc) {
    var queued = this.pending;
    this.pending = [];
    return Promise.all(
      queued.map(function (candidate) {
        return pc.addIceCandidate(candidate).catch(function () {});
      })
    );
  };

  function addCandidate(pc, queue, candidate) {
    if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) {
      queue.push(candidate);
      return Promise.resolve();
    }
    return pc.addIceCandidate(candidate).catch(function () {});
  }

  /**
   * Lado de quem RECEBE video (espectador e central do admin).
   * connectionState === "connected" nao prova nada: o video pode estar congelado.
   * Por isso o watchdog le getStats() e so declara "ao vivo" quando framesDecoded/bytesReceived
   * realmente avancam entre duas leituras.
   */
  function Receiver(options) {
    this.options = options || {};
    this.pc = null;
    this.queue = new IceQueue();
    this.watchdogTimer = null;
    this.lastStats = null;
    this.staleChecks = 0;
    this.liveConfirmed = false;
    this.closed = false;
  }

  Receiver.prototype._emitStatus = function (status, detail) {
    if (typeof this.options.onStatus === 'function') this.options.onStatus(status, detail || {});
  };

  Receiver.prototype._createPeer = function () {
    var self = this;
    var pc = new RTCPeerConnection({ iceServers: this.options.iceServers || [] });

    pc.ontrack = function (event) {
      if (typeof self.options.onStream === 'function') self.options.onStream(event.streams[0]);
    };

    pc.onicecandidate = function (event) {
      if (event.candidate && typeof self.options.sendIce === 'function') {
        self.options.sendIce(event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = function () {
      if (self.closed) return;
      var state = pc.connectionState;
      if (state === 'connected') {
        // Ainda nao e "ao vivo": quem decide isso e o watchdog de frames.
        self._emitStatus(self.liveConfirmed ? 'live' : 'connecting');
      } else if (state === 'failed') {
        self._emitStatus('interrupted');
        self.requestRenegotiate();
      } else if (state === 'disconnected') {
        self.liveConfirmed = false;
        self._emitStatus('reconnecting');
      } else if (state === 'connecting') {
        self._emitStatus('connecting');
      }
    };

    return pc;
  };

  Receiver.prototype.handleOffer = function (sdp) {
    var self = this;
    if (this.closed) return Promise.resolve();
    if (!this.pc || this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
      if (this.pc) this.pc.close();
      this.pc = this._createPeer();
      this.lastStats = null;
      this.liveConfirmed = false;
    }
    var pc = this.pc;
    this._emitStatus('negotiating');
    return pc
      .setRemoteDescription(new RTCSessionDescription(sdp))
      .then(function () {
        return self.queue.flush(pc);
      })
      .then(function () {
        return pc.createAnswer();
      })
      .then(function (answer) {
        return pc.setLocalDescription(answer).then(function () {
          return answer;
        });
      })
      .then(function (answer) {
        if (typeof self.options.sendAnswer === 'function') {
          self.options.sendAnswer({ type: answer.type, sdp: answer.sdp });
        }
        self.startWatchdog();
      })
      .catch(function (err) {
        self._emitStatus('error', { message: err.message });
      });
  };

  Receiver.prototype.addIceCandidate = function (candidate) {
    return addCandidate(this.pc, this.queue, candidate);
  };

  Receiver.prototype.requestRenegotiate = function () {
    if (this.closed) return;
    if (typeof this.options.requestRenegotiate === 'function') this.options.requestRenegotiate();
  };

  Receiver.prototype.startWatchdog = function () {
    var self = this;
    if (this.watchdogTimer) return;
    this.watchdogTimer = setInterval(function () {
      self.checkProgress();
    }, WATCHDOG_INTERVAL_MS);
  };

  Receiver.prototype.checkProgress = function () {
    var self = this;
    if (!this.pc || this.closed) return Promise.resolve();
    return this.pc
      .getStats()
      .then(function (report) {
        var current = null;
        report.forEach(function (stat) {
          if (stat.type === 'inbound-rtp' && (stat.kind === 'video' || stat.mediaType === 'video')) {
            current = {
              framesDecoded: stat.framesDecoded || 0,
              bytesReceived: stat.bytesReceived || 0,
              packetsLost: stat.packetsLost || 0,
              packetsReceived: stat.packetsReceived || 0,
              framesDropped: stat.framesDropped || 0,
              frameHeight: stat.frameHeight || 0,
            };
          }
        });
        if (!current) return;

        var previous = self.lastStats;
        self.lastStats = current;
        if (!previous) return;

        // O veredito de saude alimenta o modo automatico de qualidade.
        if (typeof self.options.onHealth === 'function' && window.Quality) {
          self.options.onHealth(window.Quality.judge(previous, current), current);
        }

        var progressed =
          current.framesDecoded > previous.framesDecoded ||
          current.bytesReceived > previous.bytesReceived;

        if (progressed) {
          self.staleChecks = 0;
          if (!self.liveConfirmed) {
            self.liveConfirmed = true;
            self._emitStatus('live');
          }
          return;
        }

        self.staleChecks += 1;
        self.liveConfirmed = false;
        self._emitStatus('interrupted', { staleChecks: self.staleChecks });
        if (self.staleChecks >= STALE_CHECKS_BEFORE_RENEGOTIATE) {
          self.staleChecks = 0;
          self.requestRenegotiate();
        }
      })
      .catch(function () {});
  };

  Receiver.prototype.close = function () {
    this.closed = true;
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.pc = null;
  };

  /**
   * Lado do transmissor: UMA conexao por espectador, ciclos de vida isolados.
   * O transmissor SEMPRE cria a oferta.
   */
  function Sender(options) {
    this.options = options || {};
    this.viewerId = this.options.viewerId;
    this.stream = this.options.stream;
    this.queue = new IceQueue();
    this.pc = this._createPeer();
    this.closed = false;
  }

  Sender.prototype._createPeer = function () {
    var self = this;
    var pc = new RTCPeerConnection({ iceServers: this.options.iceServers || [] });

    pc.onicecandidate = function (event) {
      if (event.candidate && typeof self.options.sendIce === 'function') {
        self.options.sendIce(self.viewerId, event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = function () {
      if (typeof self.options.onStateChange === 'function') {
        self.options.onStateChange(self.viewerId, pc.connectionState);
      }
    };

    if (this.stream) {
      this.stream.getTracks().forEach(function (track) {
        pc.addTrack(track, self.stream);
      });
    }

    return pc;
  };

  Sender.prototype.createOffer = function (iceRestart) {
    var self = this;
    if (this.closed) return Promise.resolve();
    return this.pc
      .createOffer({ iceRestart: Boolean(iceRestart) })
      .then(function (offer) {
        return self.pc.setLocalDescription(offer).then(function () {
          return offer;
        });
      })
      .then(function (offer) {
        if (typeof self.options.sendOffer === 'function') {
          self.options.sendOffer(self.viewerId, { type: offer.type, sdp: offer.sdp });
        }
      })
      .catch(function (err) {
        if (typeof self.options.onError === 'function') self.options.onError(self.viewerId, err);
      });
  };

  Sender.prototype.handleAnswer = function (sdp) {
    var self = this;
    return this.pc
      .setRemoteDescription(new RTCSessionDescription(sdp))
      .then(function () {
        return self.queue.flush(self.pc);
      })
      .catch(function () {});
  };

  Sender.prototype.addIceCandidate = function (candidate) {
    return addCandidate(this.pc, this.queue, candidate);
  };

  Sender.prototype.replaceStream = function (stream) {
    var self = this;
    this.stream = stream;
    var senders = this.pc.getSenders();
    var tracks = stream.getTracks();
    tracks.forEach(function (track) {
      var existing = senders.find(function (sender) {
        return sender.track && sender.track.kind === track.kind;
      });
      if (existing) existing.replaceTrack(track);
      else self.pc.addTrack(track, stream);
    });
  };

  // Qualidade de UM espectador: mexe so nesta conexao, as outras seguem intactas.
  Sender.prototype.applyQuality = function (level, capturedHeight) {
    if (!this.pc || this.closed || !window.Quality) return Promise.resolve();
    var videoSender = this.pc.getSenders().filter(function (s) {
      return s.track && s.track.kind === 'video';
    })[0];
    if (!videoSender || !videoSender.getParameters) return Promise.resolve();

    var params = videoSender.getParameters();
    if (!params.encodings || !params.encodings.length) params.encodings = [{}];

    var enc = window.Quality.encodingFor(level, capturedHeight);
    params.encodings[0].maxBitrate = enc.maxBitrate;
    params.encodings[0].maxFramerate = enc.maxFramerate;
    params.encodings[0].scaleResolutionDownBy = enc.scaleResolutionDownBy;
    this.quality = level;

    return videoSender.setParameters(params).catch(function () {});
  };

  Sender.prototype.close = function () {
    this.closed = true;
    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    }
    this.pc = null;
  };

  window.RTC = {
    fetchIceServers: fetchIceServers,
    Receiver: Receiver,
    Sender: Sender,
    IceQueue: IceQueue,
    WATCHDOG_INTERVAL_MS: WATCHDOG_INTERVAL_MS,
    STALE_CHECKS_BEFORE_RENEGOTIATE: STALE_CHECKS_BEFORE_RENEGOTIATE,
  };
})();
