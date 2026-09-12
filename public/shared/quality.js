(function (root, factory) {
  // Serve para o navegador e para os testes em node sem etapa de build.
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Quality = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Do mais leve para o mais pesado: a ordem do array E a escada de qualidade.
  var LEVELS = [
    { id: 'minima', label: 'Minima',  height: 360,  frameRate: 10, maxBitrate: 250000 },
    { id: 'baixa',  label: 'Baixa',   height: 540,  frameRate: 15, maxBitrate: 600000 },
    { id: 'media',  label: 'Media',   height: 720,  frameRate: 24, maxBitrate: 1500000 },
    { id: 'alta',   label: 'Alta',    height: 1080, frameRate: 30, maxBitrate: 3000000 },
  ];

  var AUTO = 'auto';
  var DEFAULT_LEVEL = 'media';
  var DESCEU_APOS = 2; // checagens ruins seguidas para descer um degrau
  var SUBIU_APOS = 6;  // checagens boas seguidas para tentar subir

  function indexOf(id) {
    for (var i = 0; i < LEVELS.length; i += 1) {
      if (LEVELS[i].id === id) return i;
    }
    return -1;
  }

  function isValid(id) {
    return id === AUTO || indexOf(id) !== -1;
  }

  function get(id) {
    var i = indexOf(id);
    return i === -1 ? LEVELS[indexOf(DEFAULT_LEVEL)] : LEVELS[i];
  }

  function step(id, direcao) {
    var i = indexOf(id);
    if (i === -1) i = indexOf(DEFAULT_LEVEL);
    var alvo = Math.min(LEVELS.length - 1, Math.max(0, i + direcao));
    return LEVELS[alvo].id;
  }

  // Restricoes de captura: sempre como maximo, para so reduzir o que a tela entrega.
  function captureConstraints(id) {
    var nivel = get(id);
    return {
      width: { max: Math.round((nivel.height * 16) / 9) },
      height: { max: nivel.height },
      frameRate: { max: nivel.frameRate },
    };
  }

  // Parametros de envio para UM espectador. A reducao e relativa ao que esta sendo
  // capturado: pedir "baixa" de uma captura ja pequena nao pode virar um vídeo ilegivel.
  function encodingFor(id, capturedHeight) {
    var nivel = get(id);
    var altura = Number(capturedHeight) || nivel.height;
    var escala = altura / nivel.height;
    if (!isFinite(escala) || escala < 1) escala = 1;
    return {
      maxBitrate: nivel.maxBitrate,
      maxFramerate: nivel.frameRate,
      scaleResolutionDownBy: Math.round(escala * 100) / 100,
    };
  }

  // Le as estatisticas de recepcao e devolve um veredito simples.
  function judge(anterior, atual) {
    if (!anterior || !atual) return 'ok';

    var frames = atual.framesDecoded - anterior.framesDecoded;
    var bytes = atual.bytesReceived - anterior.bytesReceived;
    if (frames <= 0 && bytes <= 0) return 'ruim';

    var perdidos = Math.max(0, atual.packetsLost - anterior.packetsLost);
    var recebidos = Math.max(0, atual.packetsReceived - anterior.packetsReceived);
    var total = perdidos + recebidos;
    var perda = total > 0 ? (perdidos / total) * 100 : 0;

    var descartados = Math.max(0, atual.framesDropped - anterior.framesDropped);
    var descarteAlto = frames > 0 && descartados > frames * 0.2;

    if (perda > 3 || descarteAlto) return 'ruim';
    if (perda < 1 && !descarteAlto) return 'bom';
    return 'ok';
  }

  /**
   * Modo automatico. Desce rapido quando trava (o incomodo e imediato) e sobe devagar
   * (subir cedo demais faz a imagem ficar oscilando entre nitida e travada).
   */
  function createAutoController(options) {
    var config = options || {};
    var atual = isValid(config.startLevel) && config.startLevel !== AUTO ? config.startLevel : DEFAULT_LEVEL;
    var descerApos = config.descerApos || DESCEU_APOS;
    var subirApos = config.subirApos || SUBIU_APOS;
    var ruins = 0;
    var bons = 0;

    function aplicar(novo) {
      if (novo === atual) return null;
      atual = novo;
      ruins = 0;
      bons = 0;
      if (typeof config.onChange === 'function') config.onChange(atual);
      return atual;
    }

    return {
      get level() {
        return atual;
      },
      report: function (veredito) {
        if (veredito === 'ruim') {
          bons = 0;
          ruins += 1;
          if (ruins >= descerApos) return aplicar(step(atual, -1));
          return null;
        }
        if (veredito === 'bom') {
          ruins = 0;
          bons += 1;
          if (bons >= subirApos) return aplicar(step(atual, 1));
          return null;
        }
        ruins = 0;
        bons = 0;
        return null;
      },
      reset: function (nivel) {
        atual = isValid(nivel) && nivel !== AUTO ? nivel : DEFAULT_LEVEL;
        ruins = 0;
        bons = 0;
      },
    };
  }

  return {
    LEVELS: LEVELS,
    AUTO: AUTO,
    DEFAULT_LEVEL: DEFAULT_LEVEL,
    isValid: isValid,
    get: get,
    step: step,
    indexOf: indexOf,
    captureConstraints: captureConstraints,
    encodingFor: encodingFor,
    judge: judge,
    createAutoController: createAutoController,
  };
});
