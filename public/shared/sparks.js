(function () {
  'use strict';

  // Fagulhas em <div> animadas por @keyframes: sem canvas e sem biblioteca,
  // leve o suficiente para rodar em aparelho fraco.
  var timer = null;
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

  window.Sparks = {
    start: function (intervalMs) {
      if (reduceMotion || timer) return;
      timer = setInterval(spawn, intervalMs || 700);
    },
    stop: function () {
      if (timer) clearInterval(timer);
      timer = null;
      document.querySelectorAll('.fire-spark').forEach(function (el) {
        el.remove();
      });
    },
  };
})();
