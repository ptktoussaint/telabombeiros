(function () {
  'use strict';

  var socket = null;
  var iceServers = [];
  var iceReady = null;
  var liveRooms = new Map();
  var monitors = new Map();
  var roomsById = new Map();
  var branding = null;

  var STATUS_LABEL = {
    awaiting: 'Aguardando',
    capturing: 'Preparando',
    connecting: 'Conectando',
    negotiating: 'Negociando',
    live: 'Ao vivo',
    reconnecting: 'Reconectando',
    interrupted: 'Congelado',
    error: 'Erro',
  };

  var COLOR_FIELDS = [
    ['brand', 'Cor principal'],
    ['brandDeep', 'Cor principal escura'],
    ['ember', 'Brasa / destaque'],
    ['ink', 'Fundo'],
    ['surface', 'Cartoes'],
    ['text', 'Texto'],
    ['muted', 'Texto secundario'],
  ];

  var MEDIA_FIELDS = [
    ['logoUrl', 'Logo', 'image'],
    ['backgroundUrl', 'Imagem de fundo', 'image'],
    ['videoUrl', 'Video institucional', 'video'],
    ['shareImageUrl', 'Imagem do cartao de link (1200x630)', 'image'],
  ];

  /* ---------------------------------------------------------------- abas */

  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var target = btn.dataset.tab;
        document.querySelectorAll('.tab').forEach(function (section) {
          section.hidden = section.dataset.tab !== target;
        });
        document.querySelectorAll('.tab-btn').forEach(function (other) {
          other.classList.toggle('ghost', other.dataset.tab !== target);
        });
      });
    });
    document.querySelector('.tab-btn').click();
  }

  /* ----------------------------------------------------------- dashboard */

  function loadRooms() {
    var includeClosed = document.getElementById('showClosed').checked ? '?includeClosed=1' : '';
    return UI.api('/api/admin/rooms' + includeClosed)
      .then(function (data) {
        roomsById.clear();
        data.rooms.forEach(function (room) { roomsById.set(room.roomId, room); });
        renderRooms(data.rooms);
        renderWatchControls(data.rooms);
        monitors.forEach(function (monitor, roomId) {
          if (roomsById.has(roomId)) monitor.updateRoomInfo(roomsById.get(roomId));
        });
      })
      .catch(function (err) { UI.toast(err.message); });
  }

  function statusBadgeHtml(live, status) {
    var cls = 'badge';
    if (!live || !live.transmitterOnline) cls += '';
    else if (status === 'live') cls += ' live';
    else if (status === 'interrupted' || status === 'error') cls += ' error';
    else cls += ' warn';
    var text = !live || !live.transmitterOnline ? 'Offline' : STATUS_LABEL[status] || status;
    return '<span class="' + cls + '"><span class="dot"></span>' + text + '</span>';
  }

  function renderRooms(rooms) {
    var container = document.getElementById('roomsList');
    container.innerHTML = '';

    var activeCount = rooms.filter(function (r) { return r.status === 'active'; }).length;
    var onlineCount = rooms.filter(function (r) { return r.live && r.live.transmitterOnline; }).length;
    document.getElementById('roomsSummary').textContent =
      activeCount + ' sala(s) aberta(s), ' + onlineCount + ' transmitindo agora.';

    if (!rooms.length) {
      container.innerHTML = '<p class="empty">Nenhuma sala por aqui ainda.</p>';
      return;
    }

    rooms.forEach(function (room) {
      var live = liveRooms.get(room.roomId) || room.live;
      var card = document.createElement('div');
      card.className = 'card';
      card.dataset.roomCard = room.roomId;

      card.innerHTML =
        '<div class="row" style="justify-content:space-between; align-items:flex-start">' +
        '<div><h3 style="margin:0">' + room.roomLabel + '</h3>' +
        '<p class="muted small" style="margin:4px 0 0">Aberta em ' + new Date(room.createdAt).toLocaleString('pt-BR') + '</p></div>' +
        '<div data-status="' + room.roomId + '">' + statusBadgeHtml(live, live && live.streamStatus) + '</div>' +
        '</div>' +
        '<p class="small" style="margin:12px 0 0">Espectadores agora: <strong data-viewers="' + room.roomId + '">' +
        (live ? live.viewerCount : 0) + '</strong></p>' +
        '<h4 class="small muted" style="margin:16px 0 4px">Links de convite</h4>' +
        '<ul class="list" data-invites="' + room.roomId + '"></ul>' +
        '<div class="row" style="margin-top:14px">' +
        (room.status === 'active'
          ? '<button class="btn ghost small" data-watch="' + room.roomId + '">Monitorar</button>' +
            '<button class="btn ghost small" data-close="' + room.roomId + '">Encerrar sala</button>'
          : '<span class="badge">Encerrada</span>') +
        '</div>';

      container.appendChild(card);

      var lista = card.querySelector('[data-invites="' + room.roomId + '"]');
      if (!room.invites.length) {
        lista.appendChild(UI.personRow({ empty: 'Nenhum convite gerado.' }));
      } else {
        room.invites.forEach(function (invite) {
          lista.appendChild(
            UI.personRow({
              dot: invite.active ? 'on' : 'off',
              name: invite.label,
              meta: invite.createdAt ? 'criado em ' + UI.formatDate(invite.createdAt) : '',
              struck: !invite.active,
              pill: invite.active ? 'Ativo' : 'Revogado',
              pillClass: invite.active ? 'on' : 'off',
              buttons: invite.active
                ? [UI.actionButton('Revogar', 'danger', null, { revoke: invite.id, room: room.roomId })]
                : [],
            })
          );
        });
      }
    });
  }

  function renderWatchControls(rooms) {
    var box = document.getElementById('watchControls');
    box.innerHTML = '';
    var actives = rooms.filter(function (r) { return r.status === 'active'; });
    if (!actives.length) {
      box.innerHTML = '<span class="muted small">Nenhuma sala ativa para monitorar.</span>';
      return;
    }
    actives.forEach(function (room) {
      var btn = document.createElement('button');
      btn.className = 'btn ghost small';
      btn.textContent = (monitors.has(room.roomId) ? 'Parar: ' : 'Monitorar: ') + room.roomLabel;
      btn.addEventListener('click', function () {
        if (monitors.has(room.roomId)) unwatchRoom(room.roomId);
        else watchRoom(room.roomId);
      });
      box.appendChild(btn);
    });
  }

  function applyLiveRoom(payload) {
    if (!payload) return;
    if (payload.removed) {
      liveRooms.delete(payload.roomId);
      if (monitors.has(payload.roomId)) unwatchRoom(payload.roomId);
      loadRooms();
      return;
    }
    liveRooms.set(payload.roomId, payload);

    var statusBox = document.querySelector('[data-status="' + payload.roomId + '"]');
    if (statusBox) statusBox.innerHTML = statusBadgeHtml(payload, payload.streamStatus);
    var viewersBox = document.querySelector('[data-viewers="' + payload.roomId + '"]');
    if (viewersBox) viewersBox.textContent = payload.viewerCount;

    var monitor = monitors.get(payload.roomId);
    if (monitor) monitor.updateRoomStatus(payload);
  }

  /* ------------------------------------------------- central de monitor */

  // Uma RTCPeerConnection por SALA observada, indexada por roomId - um unico socket
  // do admin atende todas elas, por isso cada mensagem carrega o roomId.
  function watchRoom(roomId) {
    if (monitors.has(roomId)) return;
    // Espera os servidores ICE: sem eles a conexao nasceria sem STUN/TURN.
    iceReady.then(function () {
      if (monitors.has(roomId)) return;
      socket.emit('admin:watch', { roomId: roomId }, function (res) {
        if (!res || !res.ok) {
          UI.toast((res && res.error) || 'Nao foi possivel monitorar esta sala.');
          return;
        }
        createMonitorTile(roomId, res.roomLabel, res.live);
        loadRooms();
      });
    });
  }

  function createMonitorTile(roomId, roomLabel, live) {
    var grid = document.getElementById('monitorGrid');
    var tile = document.createElement('div');
    tile.className = 'card monitor-tile';
    tile.innerHTML =
      '<header><h3></h3><span class="badge" data-tile-status><span class="dot"></span>conectando</span></header>' +
      '<video autoplay playsinline muted></video>' +
      '<div class="row" style="margin-top:10px">' +
      '<button class="btn small" data-tile-sound>Ativar som</button>' +
      '<button class="btn ghost small" data-tile-stop>Parar</button>' +
      '<select data-tile-quality style="flex:1 1 130px"></select>' +
      '</div>' +
      '<div class="tile-panel">' +
      '<h4>Espectadores agora <span data-tile-count>(0)</span></h4>' +
      '<ul class="tile-list" data-tile-viewers></ul>' +
      '</div>' +
      '<div class="tile-panel">' +
      '<h4>Links de convite</h4>' +
      '<ul class="tile-list" data-tile-invites></ul>' +
      '</div>';
    tile.querySelector('h3').textContent = roomLabel;
    grid.appendChild(tile);

    var video = tile.querySelector('video');
    var badge = tile.querySelector('[data-tile-status]');
    var soundBtn = tile.querySelector('[data-tile-sound]');
    var qualitySelect = tile.querySelector('[data-tile-quality]');
    var viewersBox = tile.querySelector('[data-tile-viewers]');
    var countBox = tile.querySelector('[data-tile-count]');
    var invitesBox = tile.querySelector('[data-tile-invites]');

    function setStatus(status) {
      badge.className = 'badge';
      if (status === 'live') badge.classList.add('live');
      else if (status === 'interrupted' || status === 'error') badge.classList.add('error');
      else badge.classList.add('warn');
      badge.innerHTML = '<span class="dot"></span>' + (STATUS_LABEL[status] || status);
    }

    // Cada sala tem seu proprio som: comeca mudo porque o navegador nao deixa
    // varios videos tocarem sozinhos com audio, e o admin escolhe qual quer ouvir.
    soundBtn.addEventListener('click', function () {
      video.muted = !video.muted;
      soundBtn.textContent = video.muted ? 'Ativar som' : 'Desativar som';
      soundBtn.classList.toggle('ghost', !video.muted);
      if (!video.muted) {
        video.volume = 1;
        var play = video.play();
        if (play && play.catch) play.catch(function () {});
      }
    });

    function renderViewers(viewers) {
      var lista = viewers || [];
      countBox.textContent = '(' + lista.length + ')';
      viewersBox.innerHTML = '';
      if (!lista.length) {
        viewersBox.appendChild(UI.personRow({ empty: 'Ninguem assistindo agora.' }));
        return;
      }
      lista.forEach(function (viewer) {
        viewersBox.appendChild(
          UI.personRow({
            dot: 'on',
            name: viewer.label || 'Espectador',
            meta: 'entrou as ' + UI.formatTime(viewer.joinedAt),
          })
        );
      });
    }

    function renderInvites(invites) {
      var lista = invites || [];
      invitesBox.innerHTML = '';
      if (!lista.length) {
        invitesBox.appendChild(UI.personRow({ empty: 'Nenhum convite gerado.' }));
        return;
      }
      lista.forEach(function (invite) {
        invitesBox.appendChild(
          UI.personRow({
            dot: invite.active ? 'on' : 'off',
            name: invite.label,
            meta: invite.createdAt ? 'criado em ' + UI.formatDate(invite.createdAt) : '',
            struck: !invite.active,
            pill: invite.active ? 'Ativo' : 'Revogado',
            pillClass: invite.active ? 'on' : 'off',
            buttons: invite.active
              ? [UI.actionButton('Revogar', 'danger', null, { revoke: invite.id, room: roomId })]
              : [],
          })
        );
      });
    }

    // A central assiste varias salas de uma vez, entao cada quadro comeca leve:
    // somar quatro transmissoes em alta trava o computador do admin.
    var escolha = Quality.AUTO;
    var autoQualidade = Quality.createAutoController({
      startLevel: 'baixa',
      onChange: function (nivel) { pedirQualidade(nivel); },
    });

    function pedirQualidade(nivel) {
      socket.emit('quality:request', { roomId: roomId, level: nivel });
    }

    function aplicarEscolha(valor) {
      escolha = valor;
      if (valor === Quality.AUTO) {
        autoQualidade.reset('baixa');
        pedirQualidade(autoQualidade.level);
        return;
      }
      pedirQualidade(valor);
    }

    qualitySelect.innerHTML = '';
    var autoOpt = document.createElement('option');
    autoOpt.value = Quality.AUTO;
    autoOpt.textContent = 'Automatico';
    qualitySelect.appendChild(autoOpt);
    Quality.LEVELS.slice().reverse().forEach(function (nivel) {
      var opt = document.createElement('option');
      opt.value = nivel.id;
      opt.textContent = nivel.label;
      qualitySelect.appendChild(opt);
    });
    qualitySelect.value = escolha;
    qualitySelect.addEventListener('change', function () {
      aplicarEscolha(qualitySelect.value);
    });

    var receiver = new RTC.Receiver({
      iceServers: iceServers,
      onHealth: function (veredito) {
        if (escolha === Quality.AUTO) autoQualidade.report(veredito);
      },
      sendAnswer: function (sdp) { socket.emit('webrtc:answer', { roomId: roomId, sdp: sdp }); },
      sendIce: function (candidate) { socket.emit('webrtc:ice', { roomId: roomId, candidate: candidate }); },
      requestRenegotiate: function () { socket.emit('webrtc:request-renegotiate', { roomId: roomId }); },
      onStatus: setStatus,
      onStream: function (stream) {
        video.srcObject = stream;
        var play = video.play();
        if (play && play.catch) play.catch(function () {});
      },
    });

    var monitor = {
      roomId: roomId,
      receiver: receiver,
      tile: tile,
      setStatus: setStatus,
      updateRoomStatus: function (payload) {
        renderViewers(payload.viewers);
        if (!payload.transmitterOnline) setStatus('awaiting');
      },
      updateRoomInfo: function (room) {
        tile.querySelector('h3').textContent = room.roomLabel;
        renderInvites(room.invites);
      },
    };
    monitors.set(roomId, monitor);
    aplicarEscolha(escolha);
    if (live) monitor.updateRoomStatus(live);
    if (roomsById.has(roomId)) monitor.updateRoomInfo(roomsById.get(roomId));
    else renderInvites([]);
    renderViewers(live ? live.viewers : []);
    setStatus('connecting');

    tile.querySelector('[data-tile-stop]').addEventListener('click', function () {
      unwatchRoom(roomId);
    });
  }

  function unwatchRoom(roomId) {
    var monitor = monitors.get(roomId);
    if (!monitor) return;
    monitor.receiver.close();
    monitor.tile.remove();
    monitors.delete(roomId);
    if (socket) socket.emit('admin:unwatch', { roomId: roomId });
    loadRooms();
  }

  /* ---------------------------------------------------------- identidade */

  function buildBrandingForm() {
    var colorGrid = document.getElementById('colorGrid');
    colorGrid.innerHTML = '';
    COLOR_FIELDS.forEach(function (field) {
      var wrap = document.createElement('div');
      wrap.innerHTML =
        '<label for="color-' + field[0] + '">' + field[1] + '</label>' +
        '<input type="color" id="color-' + field[0] + '" data-color="' + field[0] + '" />';
      colorGrid.appendChild(wrap);
    });

    colorGrid.addEventListener('input', function (event) {
      var key = event.target.dataset.color;
      if (!key) return;
      var vars = {
        brand: '--brand', brandDeep: '--brand-deep', ember: '--ember',
        ink: '--ink', surface: '--surface', text: '--text', muted: '--muted',
      };
      document.documentElement.style.setProperty(vars[key], event.target.value);
    });

    var mediaGrid = document.getElementById('mediaGrid');
    mediaGrid.innerHTML = '';
    MEDIA_FIELDS.forEach(function (field) {
      var key = field[0];
      var wrap = document.createElement('div');
      wrap.innerHTML =
        '<label for="media-' + key + '">' + field[1] + '</label>' +
        '<input type="url" id="media-' + key + '" data-media="' + key + '" placeholder="https://... (link externo) ou envie um arquivo" />' +
        '<div class="row tight" style="margin-top:8px">' +
        '<input type="file" id="file-' + key + '" accept="' + (field[2] === 'video' ? 'video/*' : 'image/*') + '" style="flex:1 1 140px" />' +
        '<button class="btn ghost small" data-upload="' + key + '">Enviar arquivo</button>' +
        '<button class="btn ghost small" data-clear="' + key + '">Limpar</button>' +
        '</div>' +
        '<div class="preview-frame" data-preview="' + key + '"><span class="muted small">sem midia</span></div>' +
        '<div class="preview-status" data-preview-status="' + key + '"></div>';
      mediaGrid.appendChild(wrap);
    });

    mediaGrid.addEventListener('input', function (event) {
      var key = event.target.dataset.media;
      if (key) updatePreview(key, event.target.value.trim());
    });

    mediaGrid.addEventListener('click', function (event) {
      var uploadKey = event.target.dataset.upload;
      var clearKey = event.target.dataset.clear;
      if (uploadKey) return uploadMedia(uploadKey);
      if (clearKey) {
        document.getElementById('media-' + clearKey).value = '';
        updatePreview(clearKey, '');
      }
    });
  }

  // Validar so o formato da URL nao prova que ela aponta para uma midia de verdade:
  // o preview usa onload/onerror do proprio elemento para dizer na hora se o link funciona.
  function updatePreview(key, url) {
    var frame = document.querySelector('[data-preview="' + key + '"]');
    var status = document.querySelector('[data-preview-status="' + key + '"]');
    frame.innerHTML = '';
    status.textContent = '';
    status.className = 'preview-status';
    if (!url) {
      frame.innerHTML = '<span class="muted small">sem midia</span>';
      return;
    }
    var isVideo = MEDIA_FIELDS.some(function (f) { return f[0] === key && f[2] === 'video'; });
    var el = document.createElement(isVideo ? 'video' : 'img');
    if (isVideo) {
      el.muted = true;
      el.controls = true;
      el.addEventListener('loadeddata', function () {
        status.textContent = 'Link valido: o video carregou.';
        status.classList.add('ok');
      });
    } else {
      el.addEventListener('load', function () {
        status.textContent = 'Link valido: a imagem carregou.';
        status.classList.add('ok');
      });
    }
    el.addEventListener('error', function () {
      status.textContent = 'Este link nao carregou como midia. Confira o endereco.';
      status.classList.add('fail');
    });
    el.src = url;
    frame.appendChild(el);
  }

  function uploadMedia(key) {
    var input = document.getElementById('file-' + key);
    if (!input.files || !input.files[0]) {
      UI.toast('Escolha um arquivo primeiro.');
      return;
    }
    var body = new FormData();
    body.append('file', input.files[0]);
    fetch('/api/admin/branding/upload', { method: 'POST', body: body, credentials: 'same-origin' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) throw new Error(data.error);
        document.getElementById('media-' + key).value = data.url;
        updatePreview(key, data.url);
        UI.toast('Arquivo enviado. Lembre de salvar.');
      })
      .catch(function (err) { UI.toast(err.message); });
  }

  function fillBrandingForm(data) {
    branding = data;
    document.getElementById('siteName').value = data.siteName || '';
    document.getElementById('tagline').value = data.tagline || '';
    document.getElementById('shareTitle').value = data.shareTitle || '';
    document.getElementById('shareDescription').value = data.shareDescription || '';
    COLOR_FIELDS.forEach(function (field) {
      var input = document.getElementById('color-' + field[0]);
      if (input) input.value = (data.colors && data.colors[field[0]]) || '#000000';
    });
    MEDIA_FIELDS.forEach(function (field) {
      var input = document.getElementById('media-' + field[0]);
      if (input) {
        input.value = data[field[0]] || '';
        updatePreview(field[0], input.value);
      }
    });
    document.getElementById('fxSpotlight').checked = !data.effects || data.effects.spotlight !== false;
    document.getElementById('fxSparks').checked = !data.effects || data.effects.sparks !== false;
    var rate = data.effects && data.effects.sparkRate !== undefined ? data.effects.sparkRate : 20;
    document.getElementById('fxSparkRate').value = rate;
    document.getElementById('fxSparkRateValue').textContent = rate;
  }

  var COLOR_VARS = {
    brand: '--brand', brandDeep: '--brand-deep', ember: '--ember',
    ink: '--ink', surface: '--surface', text: '--text', muted: '--muted',
  };

  function aplicarTema(tema) {
    Object.keys(COLOR_VARS).forEach(function (chave) {
      var input = document.getElementById('color-' + chave);
      if (input && tema[chave]) {
        input.value = tema[chave];
        document.documentElement.style.setProperty(COLOR_VARS[chave], tema[chave]);
      }
    });
  }

  function detectarCores(btn) {
    var url =
      document.getElementById('media-logoUrl').value.trim() ||
      document.getElementById('media-backgroundUrl').value.trim();

    if (!url) {
      UI.toast('Coloque um logo ou uma imagem de fundo primeiro.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Analisando...';
    Palette.fromImageUrl(url)
      .then(function (tema) {
        aplicarTema(tema);
        UI.toast('Cores detectadas. Ajuste se quiser e clique em salvar.');
      })
      .catch(function (err) { UI.toast(UI.paletteError(err)); })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = 'Detectar cores da imagem';
      });
  }

  function saveBranding() {
    var colors = {};
    COLOR_FIELDS.forEach(function (field) {
      colors[field[0]] = document.getElementById('color-' + field[0]).value;
    });
    var body = {
      siteName: document.getElementById('siteName').value,
      tagline: document.getElementById('tagline').value,
      shareTitle: document.getElementById('shareTitle').value,
      shareDescription: document.getElementById('shareDescription').value,
      colors: colors,
      effects: {
        spotlight: document.getElementById('fxSpotlight').checked,
        sparks: document.getElementById('fxSparks').checked,
        sparkRate: Number(document.getElementById('fxSparkRate').value),
      },
    };
    MEDIA_FIELDS.forEach(function (field) {
      body[field[0]] = document.getElementById('media-' + field[0]).value.trim();
    });

    UI.api('/api/admin/branding', { method: 'PUT', body: body })
      .then(function (data) {
        Theme.applyBranding(data);
        fillBrandingForm(data);
        UI.toast('Identidade visual salva.');
      })
      .catch(function (err) { UI.toast(err.message); });
  }

  /* -------------------------------------------------------------- socket */

  function setConnection(state) {
    var badge = document.getElementById('connBadge');
    badge.className = 'badge' + (state === 'online' ? ' live' : ' warn');
    document.getElementById('connText').textContent = state === 'online' ? 'Conectado' : 'Reconectando';
  }

  function setupSocket() {
    socket = io({ withCredentials: true });

    socket.on('connect', function () {
      setConnection('online');
      // Depois de uma reconexao o servidor nao lembra mais o que este socket assistia.
      var watched = [...monitors.keys()];
      monitors.forEach(function (monitor) {
        monitor.receiver.close();
        monitor.tile.remove();
      });
      monitors.clear();
      watched.forEach(watchRoom);
    });

    socket.on('disconnect', function () { setConnection('offline'); });

    socket.on('live:snapshot', function (payload) {
      (payload.rooms || []).forEach(function (room) { liveRooms.set(room.roomId, room); });
      loadRooms();
    });

    socket.on('live:room', applyLiveRoom);

    socket.on('webrtc:offer', function (payload) {
      iceReady.then(function () {
        var monitor = monitors.get(payload.roomId);
        if (monitor) monitor.receiver.handleOffer(payload.sdp);
      });
    });

    socket.on('webrtc:ice', function (payload) {
      iceReady.then(function () {
        var monitor = monitors.get(payload.roomId);
        if (monitor) monitor.receiver.addIceCandidate(payload.candidate);
      });
    });

    socket.on('webrtc:renegotiate-exhausted', function (payload) {
      var monitor = monitors.get(payload.roomId);
      if (monitor) monitor.setStatus('error');
      UI.toast('Uma sala monitorada nao se recuperou sozinha.');
    });

    socket.on('branding:updated', function (data) { Theme.applyBranding(data); });

    socket.on('auth:error', function () { location.href = '/admin/login'; });
  }

  /* ---------------------------------------------------------------- init */

  document.addEventListener('click', function (event) {
    var closeId = event.target.dataset && event.target.dataset.close;
    var watchId = event.target.dataset && event.target.dataset.watch;
    var revokeId = event.target.dataset && event.target.dataset.revoke;

    if (closeId) {
      if (!confirm('Encerrar esta sala?')) return;
      UI.api('/api/rooms/' + closeId + '/close', { method: 'POST' })
        .then(function () { UI.toast('Sala encerrada.'); return loadRooms(); })
        .catch(function (err) { UI.toast(err.message); });
    }

    if (watchId) {
      watchRoom(watchId);
      document.querySelector('.tab-btn[data-tab="monitor"]').click();
    }

    if (revokeId) {
      var roomId = event.target.dataset.room;
      UI.api('/api/rooms/' + roomId + '/invites/' + revokeId + '/revoke', { method: 'POST' })
        .then(function () { UI.toast('Convite revogado.'); return loadRooms(); })
        .catch(function (err) { UI.toast(err.message); });
    }
  });

  // A barra mexe nas fagulhas na hora, antes de salvar, para o admin ver o que esta escolhendo.
  function previewSparks() {
    var rate = Number(document.getElementById('fxSparkRate').value);
    document.getElementById('fxSparkRateValue').textContent = rate;
    if (window.Sparks) {
      window.Sparks.setIntensity(document.getElementById('fxSparks').checked ? rate : 0);
    }
  }

  document.getElementById('fxSparkRate').addEventListener('input', previewSparks);
  document.getElementById('fxSparks').addEventListener('change', previewSparks);

  document.getElementById('refreshRooms').addEventListener('click', loadRooms);
  document.getElementById('showClosed').addEventListener('change', loadRooms);
  document.getElementById('saveBranding').addEventListener('click', saveBranding);
  document.getElementById('detectColors').addEventListener('click', function () {
    detectarCores(this);
  });
  document.getElementById('reloadBranding').addEventListener('click', function () {
    UI.api('/api/branding').then(function (data) {
      Theme.applyBranding(data);
      fillBrandingForm(data);
    });
  });
  document.getElementById('logoutBtn').addEventListener('click', function () {
    UI.api('/api/admin/logout', { method: 'POST' }).then(function () { location.href = '/'; });
  });

  UI.api('/api/admin/session')
    .then(function (data) {
      if (!data.admin) {
        location.href = '/admin/login';
        return;
      }
      setupTabs();
      buildBrandingForm();
      iceReady = RTC.fetchIceServers()
        .then(function (servers) { iceServers = servers; })
        .catch(function () { UI.toast('Nao foi possivel carregar os servidores de conexao.'); });
      setupSocket();
      loadRooms();
      UI.api('/api/branding').then(fillBrandingForm);
    })
    .catch(function () { location.href = '/admin/login'; });
})();
