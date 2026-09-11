(function () {
  'use strict';

  var toastEl = null;
  var toastTimer = null;

  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 3200);
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () {
        toast('Link copiado.');
      });
    }
    var input = document.createElement('textarea');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      toast('Link copiado.');
    } catch (err) {
      toast('Copie manualmente: ' + text);
    }
    input.remove();
    return Promise.resolve();
  }

  function api(url, options) {
    var opts = options || {};
    return fetch(url, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          if (!res.ok) throw new Error(data.error || 'Falha na requisicao (' + res.status + ').');
          return data;
        });
    });
  }

  function formatTime(ts) {
    if (!ts) return '--';
    return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  // Validar o formato da URL nao prova que ela aponta para uma midia de verdade:
  // quem responde isso e o onload/onerror do proprio elemento.
  function mediaPreview(frame, status, url, isVideo) {
    frame.innerHTML = '';
    status.textContent = '';
    status.className = 'preview-status';
    if (!url) {
      frame.innerHTML = '<span class="muted small">usando o padrao do site</span>';
      return;
    }
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

  window.UI = {
    toast: toast,
    copy: copy,
    api: api,
    formatTime: formatTime,
    mediaPreview: mediaPreview,
  };
})();
