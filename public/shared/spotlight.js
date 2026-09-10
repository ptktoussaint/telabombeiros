(function () {
  'use strict';

  // O JS so escreve duas custom properties; o gradiente inteiro vive no CSS,
  // entao o efeito acompanha automaticamente qualquer troca de tema feita pelo admin.
  var root = document.documentElement;
  var pending = false;
  var lastX = 0;
  var lastY = 0;

  function apply() {
    pending = false;
    root.style.setProperty('--mx', lastX + 'px');
    root.style.setProperty('--my', lastY + 'px');
  }

  function track(x, y) {
    lastX = x;
    lastY = y;
    if (pending) return;
    pending = true;
    requestAnimationFrame(apply);
  }

  window.Spotlight = {
    enable: function () {
      document.body.classList.add('spotlight-on');
    },
    disable: function () {
      document.body.classList.remove('spotlight-on');
    },
  };

  window.addEventListener('mousemove', function (event) {
    track(event.clientX, event.clientY);
  });

  window.addEventListener(
    'touchmove',
    function (event) {
      var touch = event.touches && event.touches[0];
      if (touch) track(touch.clientX, touch.clientY);
    },
    { passive: true }
  );
})();
