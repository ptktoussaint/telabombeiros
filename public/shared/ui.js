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

  // Monta a linha padrao de pessoa/convite usada na sala e na central,
  // para as tres listas do sistema terem sempre o mesmo desenho.
  function personRow(opts) {
    var li = document.createElement('li');

    if (opts.empty) {
      li.className = 'plain';
      li.textContent = opts.empty;
      return li;
    }

    var dot = document.createElement('span');
    dot.className = 'row-dot' + (opts.dot ? ' ' + opts.dot : '');

    var main = document.createElement('div');
    main.className = 'row-main';

    var name = document.createElement('span');
    name.className = 'row-name' + (opts.struck ? ' off' : '');
    name.textContent = opts.name;
    name.title = opts.name;
    main.appendChild(name);

    if (opts.meta) {
      var meta = document.createElement('span');
      meta.className = 'row-meta';
      meta.textContent = opts.meta;
      main.appendChild(meta);
    }

    var actions = document.createElement('div');
    actions.className = 'row-actions';

    if (opts.pill) {
      var pill = document.createElement('span');
      pill.className = 'pill' + (opts.pillClass ? ' ' + opts.pillClass : '');
      pill.textContent = opts.pill;
      actions.appendChild(pill);
    }

    (opts.buttons || []).forEach(function (btn) {
      if (btn) actions.appendChild(btn);
    });

    li.appendChild(dot);
    li.appendChild(main);
    li.appendChild(actions);
    return li;
  }

  function actionButton(label, className, onClick, data) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small ' + (className || 'ghost');
    btn.textContent = label;
    if (data) {
      Object.keys(data).forEach(function (key) {
        btn.dataset[key] = data[key];
      });
    }
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
  }

  function formatDate(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  // Sala encerrada: nao redireciona ninguem, so cobre a pagina com o tema da sala.
  function showRoomEnded(opts) {
    var config = opts || {};
    if (document.querySelector('.ended-overlay')) return;

    var overlay = document.createElement('div');
    overlay.className = 'ended-overlay';

    var box = document.createElement('div');
    box.className = 'ended-box';

    var mark = document.createElement('div');
    mark.className = 'ended-mark';
    var branding = window.__branding || {};
    if (branding.logoUrl) {
      var img = document.createElement('img');
      img.src = branding.logoUrl;
      img.alt = '';
      img.onerror = function () { mark.textContent = '🔥'; };
      mark.appendChild(img);
    } else {
      mark.textContent = '🔥';
    }
    box.appendChild(mark);

    if (config.roomLabel) {
      var room = document.createElement('p');
      room.className = 'ended-room';
      room.textContent = config.roomLabel;
      box.appendChild(room);
    }

    var title = document.createElement('h2');
    title.className = 'ended-title';
    title.textContent = config.message || 'A sala foi encerrada pelo Host';
    box.appendChild(title);

    if (config.note) {
      var note = document.createElement('p');
      note.className = 'ended-note';
      note.textContent = config.note;
      box.appendChild(note);
    }

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.title = config.message || 'Sala encerrada';
  }

  window.UI = {
    showRoomEnded: showRoomEnded,
    personRow: personRow,
    actionButton: actionButton,
    formatDate: formatDate,
    toast: toast,
    copy: copy,
    api: api,
    formatTime: formatTime,
    mediaPreview: mediaPreview,
  };
})();
