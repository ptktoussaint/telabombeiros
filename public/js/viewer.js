(function () {
  'use strict';

  var roomId = location.pathname.split('/')[2];

  // A pagina agora e servida direto no endereco com o token (para a previa do link
  // funcionar), entao e aqui que o token sai da barra de enderecos e do historico.
  if (location.search && window.history && history.replaceState) {
    history.replaceState({}, '', location.pathname);
  }
  var socket = io({ withCredentials: true });
  var receiver = null;
  var iceServers = [];
  // Uma oferta pode chegar antes de /api/ice-servers responder; sem esperar,
  // a PeerConnection nasceria sem STUN/TURN e falharia atras de NAT.
  var iceReady = null;

  var els = {
    video: document.getElementById('remote'),
    statusBadge: document.getElementById('statusBadge'),
    statusText: document.getElementById('statusText'),
    roomTitle: document.getElementById('roomTitle'),
    viewerLabel: document.getElementById('viewerLabel'),
  };

  var STATUS_LABEL = {
    awaiting: 'Aguardando transmissao',
    capturing: 'Transmissor preparando',
    connecting: 'Conectando',
    negotiating: 'Negociando',
    live: 'Ao vivo',
    reconnecting: 'Reconectando',
    interrupted: 'Imagem parada',
    error: 'Erro',
  };

  function setStatus(status) {
    els.statusText.textContent = STATUS_LABEL[status] || status;
    els.statusBadge.className = 'badge';
    if (status === 'live') els.statusBadge.classList.add('live');
    else if (status === 'error' || status === 'interrupted') els.statusBadge.classList.add('error');
    else if (status !== 'awaiting') els.statusBadge.classList.add('warn');
  }

  function ensureReceiver() {
    if (receiver) return receiver;
    receiver = new RTC.Receiver({
      iceServers: iceServers,
      sendAnswer: function (sdp) { socket.emit('webrtc:answer', { sdp: sdp }); },
      sendIce: function (candidate) { socket.emit('webrtc:ice', { candidate: candidate }); },
      requestRenegotiate: function () { socket.emit('webrtc:request-renegotiate', {}); },
      onStatus: setStatus,
      onStream: function (stream) {
        els.video.srcObject = stream;
        var play = els.video.play();
        if (play && play.catch) play.catch(function () {});
      },
    });
    return receiver;
  }

  socket.on('viewer:ready', function (payload) {
    els.roomTitle.textContent = payload.roomLabel;
    document.title = payload.roomLabel + ' - ao vivo';
    setStatus(payload.transmitterOnline ? payload.streamStatus || 'connecting' : 'awaiting');
  });

  socket.on('webrtc:offer', function (payload) {
    iceReady.then(function () {
      ensureReceiver().handleOffer(payload.sdp);
    });
  });

  socket.on('webrtc:ice', function (payload) {
    iceReady.then(function () {
      ensureReceiver().addIceCandidate(payload.candidate);
    });
  });

  socket.on('stream:status', function (payload) {
    if (payload.status === 'live' && !(receiver && receiver.liveConfirmed)) {
      // O transmissor dizer "ao vivo" nao basta: aqui so vale se o video estiver progredindo.
      setStatus('connecting');
      return;
    }
    setStatus(payload.status);
  });

  socket.on('transmitter:offline', function () {
    setStatus('awaiting');
  });

  socket.on('webrtc:renegotiate-exhausted', function () {
    setStatus('error');
    UI.toast('Nao foi possivel recuperar a conexao. Recarregue a pagina.');
  });

  // A aparencia da sala pode mudar no meio da transmissao; aplica na hora.
  socket.on('room:branding', function (branding) {
    Theme.applyBranding(branding);
  });

  socket.on('room:closed', function () {
    if (receiver) {
      receiver.close();
      receiver = null;
    }
    els.video.srcObject = null;
    socket.disconnect();
    UI.showRoomEnded({
      roomLabel: els.roomTitle.textContent,
      message: 'A sala foi encerrada pelo Host',
    });
  });

  function encerrarSessao(mensagem) {
    if (receiver) {
      receiver.close();
      receiver = null;
    }
    els.video.srcObject = null;
    setStatus('error');
    els.statusText.textContent = 'Desconectado';
    document.getElementById('hint').textContent = mensagem;
    // Sem isso o socket.io tentaria reconectar sozinho e a pessoa voltaria em loop.
    socket.disconnect();
    UI.toast(mensagem);
  }

  socket.on('viewer:kicked', function () {
    encerrarSessao('Quem esta transmitindo removeu voce desta sala.');
  });

  socket.on('auth:error', function (payload) {
    if (payload && payload.kicked) {
      encerrarSessao(payload.error || 'Voce foi removido desta sala.');
      return;
    }
    if (payload && payload.closed) {
      if (receiver) { receiver.close(); receiver = null; }
      els.video.srcObject = null;
      socket.disconnect();
      UI.showRoomEnded({
        roomLabel: els.roomTitle.textContent,
        message: 'A sala foi encerrada pelo Host',
      });
      return;
    }
    UI.toast((payload && payload.error) || 'Link invalido.');
  });

  socket.on('disconnect', function () {
    setStatus('reconnecting');
  });

  // Comeca mudo porque navegador nenhum deixa um video com som tocar sozinho;
  // o som so entra depois que a pessoa clica.
  var soundBtn = document.getElementById('soundBtn');
  soundBtn.addEventListener('click', function () {
    els.video.muted = !els.video.muted;
    soundBtn.textContent = els.video.muted ? 'Ativar som' : 'Desativar som';
    soundBtn.classList.toggle('ghost', !els.video.muted);
    if (!els.video.muted) {
      els.video.volume = 1;
      var play = els.video.play();
      if (play && play.catch) play.catch(function () {});
    }
  });

  document.getElementById('fullscreenBtn').addEventListener('click', function () {
    if (els.video.requestFullscreen) els.video.requestFullscreen();
    else if (els.video.webkitEnterFullscreen) els.video.webkitEnterFullscreen();
  });

  document.getElementById('reconnectBtn').addEventListener('click', function () {
    if (receiver) {
      receiver.close();
      receiver = null;
    }
    socket.emit('webrtc:request-renegotiate', {});
    setStatus('connecting');
  });

  Theme.loadRoomBranding(roomId);

  UI.api('/api/session')
    .then(function (data) {
      if (data.label) els.viewerLabel.textContent = data.label;
    })
    .catch(function () {});

  iceReady = RTC.fetchIceServers()
    .then(function (servers) { iceServers = servers; })
    .catch(function () { UI.toast('Nao foi possivel carregar os servidores de conexao.'); });
})();
