(function () {
  'use strict';

  var COLOR_VARS = {
    brand: '--brand',
    brandDeep: '--brand-deep',
    ember: '--ember',
    ink: '--ink',
    surface: '--surface',
    text: '--text',
    muted: '--muted',
  };

  function applyBranding(branding) {
    if (!branding) return;
    var root = document.documentElement;
    var colors = branding.colors || {};
    Object.keys(COLOR_VARS).forEach(function (key) {
      if (colors[key]) root.style.setProperty(COLOR_VARS[key], colors[key]);
    });

    document.querySelectorAll('[data-brand-name]').forEach(function (el) {
      el.textContent = branding.siteName || 'Tela Bombeiros';
    });
    document.querySelectorAll('[data-brand-tagline]').forEach(function (el) {
      el.textContent = branding.tagline || '';
    });

    var mark = document.querySelector('[data-brand-logo]');
    if (mark) {
      mark.innerHTML = '';
      if (branding.logoUrl) {
        var img = document.createElement('img');
        img.src = branding.logoUrl;
        img.alt = branding.siteName || 'Logo';
        img.onerror = function () {
          mark.textContent = '🔥';
        };
        mark.appendChild(img);
      } else {
        mark.textContent = '🔥';
      }
    }

    if (branding.backgroundUrl) {
      document.body.classList.add('has-bg');
      document.body.style.setProperty('--bg-image', 'url("' + branding.backgroundUrl + '")');
    } else {
      document.body.classList.remove('has-bg');
    }

    var effects = branding.effects || {};
    if (window.Spotlight) {
      if (effects.spotlight === false) window.Spotlight.disable();
      else window.Spotlight.enable();
    }
    if (window.Sparks) {
      var rate = effects.sparkRate;
      if (rate === undefined || rate === null) rate = window.Sparks.DEFAULT_INTENSITY;
      window.Sparks.setIntensity(effects.sparks === false ? 0 : rate);
    }

    window.__branding = branding;
    document.dispatchEvent(new CustomEvent('branding:applied', { detail: branding }));
  }

  function loadBranding() {
    return fetch('/api/branding')
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (branding) {
        applyBranding(branding);
        return branding;
      })
      .catch(function () {
        applyBranding({});
        return null;
      });
  }

  // A identidade da sala ja chega mesclada com a do site, entao a pagina da sala
  // busca so esta - se buscasse as duas, a tela piscaria com a aparencia errada antes.
  function loadRoomBranding(roomId) {
    return fetch('/api/rooms/' + roomId + '/branding', { credentials: 'same-origin' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (branding) {
        if (branding) applyBranding(branding);
        return branding;
      })
      .catch(function () {
        return null;
      });
  }

  window.Theme = {
    applyBranding: applyBranding,
    loadBranding: loadBranding,
    loadRoomBranding: loadRoomBranding,
  };

  function autoLoad() {
    // Paginas de sala carregam a propria identidade; nao busque a global aqui.
    if (document.body.hasAttribute('data-branding-room')) return;
    loadBranding();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoLoad);
  } else {
    autoLoad();
  }
})();
