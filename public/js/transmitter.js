(function () {
  'use strict';

  var roomId = location.pathname.split('/')[2];
  var socket = io({ withCredentials: true });

  var senders = new Map();
  var viewers = new Map();
  var iceServers = [];
  var localStream = null;
  // Um espectador pode entrar antes de /api/ice-servers responder; sem esperar,
  // a PeerConnection nasceria sem STUN/TURN e falharia atras de NAT.
  var iceReady = null;

  var els = {
    preview: document.getElementById('preview'),
    shareBtn: document.getElementById('shareBtn'),
    stopBtn: document.getElementById('stopBtn'),
    closeRoomBtn: document.getElementById('closeRoomBtn'),
    statusBadge: document.getElementById('statusBadge'),
    statusText: document.getElementById('statusText'),
    viewerList: document.getElementById('viewerList'),
    viewerCount: document.getElementById('viewerCount'),
    inviteList: document.getElementById('inviteList'),
    roomTitle: document.getElementById('roomTitle'),
  };

  var STATUS_LABEL = {
    awaiting: 'Aguardando',
    capturing: 'Tela capturada',
    connecting: 'Conectando',
    negotiating: 'Negociando',
    live: 'Ao vivo',
    reconnecting: 'Reconectando',
    interrupted: 'Interrompido',
    error: 'Erro',
  };

  function setStatus(status) {
    els.statusText.textContent = STATUS_LABEL[status] || status;
    els.statusBadge.className = 'badge';
    if (status === 'live') els.statusBadge.classList.add('live');
    else if (status === 'error' || status === 'interrupted') els.statusBadge.classList.add('error');
    else if (status !== 'awaiting') els.statusBadge.classList.add('warn');
    socket.emit('stream:status', { status: status });
  }

  function visibleViewers() {
    return [...viewers.values()].filter(function (v) {
      return !v.hidden;
    });
  }

  function renderViewers() {
    var visiveis = visibleViewers();
    els.viewerCount.textContent = '(' + visiveis.length + ')';
    els.viewerList.innerHTML = '';
    if (!visiveis.length) {
      els.viewerList.innerHTML = '<li class="muted small">Ninguem conectado ainda.</li>';
      return;
    }
    visiveis.forEach(function (viewer) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.textContent = viewer.label;
      var badge = document.createElement('span');
      badge.className = 'badge' + (viewer.state === 'connected' ? ' live' : viewer.state === 'failed' ? ' error' : '');
      badge.innerHTML = '<span class="dot"></span>' + (viewer.state || 'conectando');
      li.appendChild(name);
      li.appendChild(badge);
      els.viewerList.appendChild(li);
    });
  }

  function sendOffer(viewerId, sdp) {
    socket.emit('webrtc:offer', { viewerId: viewerId, sdp: sdp });
  }

  function sendIce(viewerId, candidate) {
    socket.emit('webrtc:ice', { viewerId: viewerId, candidate: candidate });
  }

  function onSenderState(viewerId, state) {
    var viewer = viewers.get(viewerId);
    if (!viewer) return;
    viewer.state = state;
    renderViewers();
    if (state === 'connected') setStatus('live');
  }

  // Uma RTCPeerConnection por espectador. Nunca uma compartilhada.
  function connectViewer(viewerId) {
    iceReady.then(function () { openSenderFor(viewerId); });
  }

  function openSenderFor(viewerId) {
    if (!localStream) return;
    if (!viewers.has(viewerId)) return;
    var existing = senders.get(viewerId);
    if (existing) existing.close();

    var sender = new RTC.Sender({
      viewerId: viewerId,
      stream: localStream,
      iceServers: iceServers,
      sendOffer: sendOffer,
      sendIce: sendIce,
      onStateChange: onSenderState,
    });
    senders.set(viewerId, sender);
    setStatus('negotiating');
    sender.createOffer();
  }

  function disconnectViewer(viewerId) {
    var sender = senders.get(viewerId);
    if (sender) sender.close();
    senders.delete(viewerId);
  }

  function startSharing() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      UI.toast('Este navegador nao permite compartilhar a tela.');
      return;
    }
    navigator.mediaDevices
      .getDisplayMedia({ video: { frameRate: 24 }, audio: true })
      .then(function (stream) {
        localStream = stream;
        els.preview.srcObject = stream;
        els.shareBtn.disabled = true;
        els.stopBtn.disabled = false;
        setStatus('capturing');

        stream.getVideoTracks()[0].addEventListener('ended', stopSharing);

        if (!stream.getAudioTracks().length) {
          UI.toast('Transmitindo sem som. Para enviar o audio, marque "compartilhar audio" na janela do navegador.');
        }

        // Reaproveita as conexoes existentes trocando a faixa; quem ainda nao tem, recebe uma nova.
        viewers.forEach(function (viewer, viewerId) {
          var sender = senders.get(viewerId);
          if (sender) {
            sender.replaceStream(stream);
            sender.createOffer();
          } else {
            connectViewer(viewerId);
          }
        });
      })
      .catch(function () {
        UI.toast('Compartilhamento cancelado.');
      });
  }

  function stopSharing() {
    if (localStream) localStream.getTracks().forEach(function (t) { t.stop(); });
    localStream = null;
    els.preview.srcObject = null;
    els.shareBtn.disabled = false;
    els.stopBtn.disabled = true;
    senders.forEach(function (sender) { sender.close(); });
    senders.clear();
    viewers.forEach(function (viewer) { viewer.state = 'aguardando'; });
    renderViewers();
    setStatus('awaiting');
  }

  function loadRoom() {
    return UI.api('/api/rooms/' + roomId).then(function (data) {
      els.roomTitle.textContent = data.roomLabel;
      document.title = data.roomLabel + ' - transmissao';
      renderInvites(data.invites);
      return data;
    });
  }

  function renderInvites(invites) {
    els.inviteList.innerHTML = '';
    if (!invites.length) {
      els.inviteList.innerHTML = '<li class="muted small">Nenhum convite gerado.</li>';
      return;
    }
    invites.forEach(function (invite) {
      var li = document.createElement('li');
      var left = document.createElement('span');
      left.innerHTML =
        '<strong>' + invite.label + '</strong><br><span class="muted small">' +
        (invite.active ? 'ativo' : 'revogado') + '</span>';
      li.appendChild(left);
      if (invite.active) {
        var btn = document.createElement('button');
        btn.className = 'btn ghost small';
        btn.textContent = 'Revogar';
        btn.addEventListener('click', function () {
          UI.api('/api/rooms/' + roomId + '/invites/' + invite.id + '/revoke', { method: 'POST' })
            .then(loadRoom)
            .then(function () { UI.toast('Convite revogado.'); })
            .catch(function (err) { UI.toast(err.message); });
        });
        li.appendChild(btn);
      }
      els.inviteList.appendChild(li);
    });
  }

  els.shareBtn.addEventListener('click', startSharing);
  els.stopBtn.addEventListener('click', stopSharing);

  els.closeRoomBtn.addEventListener('click', function () {
    if (!confirm('Encerrar a sala? Todos os espectadores serao desconectados.')) return;
    UI.api('/api/rooms/' + roomId + '/close', { method: 'POST' })
      .then(function () { location.href = '/'; })
      .catch(function (err) { UI.toast(err.message); });
  });

  document.getElementById('newInviteBtn').addEventListener('click', function () {
    var label = document.getElementById('inviteLabel').value.trim();
    UI.api('/api/rooms/' + roomId + '/invites', { method: 'POST', body: { label: label } })
      .then(function (invite) {
        document.getElementById('newInviteUrl').value = invite.url;
        document.getElementById('newInviteBox').hidden = false;
        document.getElementById('inviteLabel').value = '';
        return loadRoom();
      })
      .catch(function (err) { UI.toast(err.message); });
  });

  document.getElementById('copyInviteBtn').addEventListener('click', function () {
    UI.copy(document.getElementById('newInviteUrl').value);
  });

  socket.on('viewer:joined', function (payload) {
    viewers.set(payload.viewerId, {
      viewerId: payload.viewerId,
      label: payload.label,
      hidden: Boolean(payload.hidden),
      state: 'conectando',
    });
    renderViewers();
    connectViewer(payload.viewerId);
  });

  socket.on('viewer:left', function (payload) {
    viewers.delete(payload.viewerId);
    disconnectViewer(payload.viewerId);
    renderViewers();
  });

  socket.on('webrtc:answer', function (payload) {
    var sender = senders.get(payload.viewerId);
    if (sender) sender.handleAnswer(payload.sdp);
  });

  socket.on('webrtc:ice', function (payload) {
    var sender = senders.get(payload.viewerId);
    if (sender) sender.addIceCandidate(payload.candidate);
  });

  socket.on('webrtc:request-renegotiate', function (payload) {
    // Recria a conexao daquele espectador do zero - as outras nao sao tocadas.
    connectViewer(payload.viewerId);
  });

  socket.on('webrtc:renegotiate-exhausted', function (payload) {
    var viewer = viewers.get(payload.viewerId);
    if (viewer) {
      viewer.state = 'failed';
      renderViewers();
    }
    if (viewer && viewer.hidden) return;
    UI.toast('Uma conexao nao se recuperou sozinha. Peca para o espectador recarregar a pagina.');
  });

  socket.on('auth:error', function (payload) {
    UI.toast(payload.error || 'Sessao invalida.');
    setTimeout(function () { location.href = '/'; }, 1500);
  });

  socket.on('disconnect', function () {
    setStatus('reconnecting');
  });

  iceReady = RTC.fetchIceServers()
    .then(function (servers) { iceServers = servers; })
    .catch(function () { UI.toast('Nao foi possivel carregar os servidores de conexao.'); });

  loadRoom().catch(function (err) { UI.toast(err.message); });
  renderViewers();
})();
