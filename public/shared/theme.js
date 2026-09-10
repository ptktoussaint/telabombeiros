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
      if (effects.sparks === false) window.Sparks.stop();
      else window.Sparks.start();
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

  window.Theme = { applyBranding: applyBranding, loadBranding: loadBranding };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadBranding);
  } else {
    loadBranding();
  }
})();
