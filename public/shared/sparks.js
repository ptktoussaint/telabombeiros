(function () {
  'use strict';

  // Fagulhas em <div> animadas por @keyframes: sem canvas e sem biblioteca,
  // leve o suficiente para rodar em aparelho fraco.
  var DEFAULT_INTENSITY = 20;
  var MAX_PER_SECOND = 12;

  var timer = null;
  var intensity = 0;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function spawn() {
    if (document.hidden) return;
    var spark = document.createElement('div');
    spark.className = 'fire-spark';
    var size = 2 + Math.random() * 4;
    var duration = 4 + Math.random() * 4;
    spark.style.left = Math.random() * 100 + 'vw';
    spark.style.width = size + 'px';
    spark.style.height = size + 'px';
    spark.style.animationDuration = duration + 's';
    spark.style.setProperty('--drift', (Math.random() * 160 - 80).toFixed(0) + 'px');
    document.body.appendChild(spark);
    spark.addEventListener('animationend', function () {
      spark.remove();
    });
  }

  // A barra do painel vai de 0 a 100; aqui isso vira intervalo entre fagulhas.
  function intervalFor(value) {
    var perSecond = (value / 100) * MAX_PER_SECOND;
    return Math.max(40, Math.round(1000 / perSecond));
  }

  function clear() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  window.Sparks = {
    setIntensity: function (value) {
      var next = Number(value);
      if (!isFinite(next)) next = DEFAULT_INTENSITY;
      next = Math.min(100, Math.max(0, Math.round(next)));
      intensity = next;
      clear();
      if (reduceMotion || next === 0) {
        this.clearExisting();
        return;
      }
      timer = setInterval(spawn, intervalFor(next));
    },
    getIntensity: function () {
      return intensity;
    },
    clearExisting: function () {
      document.querySelectorAll('.fire-spark').forEach(function (el) {
        el.remove();
      });
    },
    start: function () {
      this.setIntensity(intensity || DEFAULT_INTENSITY);
    },
    stop: function () {
      this.setIntensity(0);
    },
    DEFAULT_INTENSITY: DEFAULT_INTENSITY,
  };
})();
