(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Palette = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SAMPLE_SIZE = 80; // a imagem e reduzida antes de ler: 6400 pixels bastam e sao instantaneos

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function rgbToHsl(r, g, b) {
    var rr = r / 255;
    var gg = g / 255;
    var bb = b / 255;
    var max = Math.max(rr, gg, bb);
    var min = Math.min(rr, gg, bb);
    var l = (max + min) / 2;
    var h = 0;
    var s = 0;

    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
      else if (max === gg) h = ((bb - rr) / d + 2) / 6;
      else h = ((rr - gg) / d + 4) / 6;
    }
    return { h: h * 360, s: s, l: l };
  }

  function hslToRgb(h, s, l) {
    var hh = (((h % 360) + 360) % 360) / 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);

    if (s === 0) {
      var v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }

    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }

    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, hh) * 255),
      b: Math.round(hue2rgb(p, q, hh - 1 / 3) * 255),
    };
  }

  function toHex(rgb) {
    function parte(v) {
      var s = clamp(Math.round(v), 0, 255).toString(16);
      return s.length === 1 ? '0' + s : s;
    }
    return '#' + parte(rgb.r) + parte(rgb.g) + parte(rgb.b);
  }

  function hsl(h, s, l) {
    return toHex(hslToRgb(h, s, l));
  }

  function hexToRgb(hex) {
    var m = String(hex).replace('#', '');
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    return {
      r: parseInt(m.slice(0, 2), 16),
      g: parseInt(m.slice(2, 4), 16),
      b: parseInt(m.slice(4, 6), 16),
    };
  }

  function luminance(hex) {
    var rgb = hexToRgb(hex);
    var canal = [rgb.r, rgb.g, rgb.b].map(function (v) {
      var c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * canal[0] + 0.7152 * canal[1] + 0.0722 * canal[2];
  }

  function contrastRatio(hexA, hexB) {
    var a = luminance(hexA);
    var b = luminance(hexB);
    var claro = Math.max(a, b);
    var escuro = Math.min(a, b);
    return (claro + 0.05) / (escuro + 0.05);
  }

  // Agrupa os pixels em caixas grosseiras e conta: cores quase iguais viram uma so.
  function quantize(pixels, options) {
    var config = options || {};
    var passo = config.step || 4; // RGBA
    var caixas = {};

    for (var i = 0; i < pixels.length; i += 4 * passo) {
      var a = pixels[i + 3];
      if (a !== undefined && a < 128) continue; // pixel transparente nao conta

      var r = pixels[i];
      var g = pixels[i + 1];
      var b = pixels[i + 2];
      var chave = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);

      if (!caixas[chave]) caixas[chave] = { r: 0, g: 0, b: 0, count: 0 };
      caixas[chave].r += r;
      caixas[chave].g += g;
      caixas[chave].b += b;
      caixas[chave].count += 1;
    }

    var lista = Object.keys(caixas)
      .map(function (chave) {
        var c = caixas[chave];
        return {
          r: Math.round(c.r / c.count),
          g: Math.round(c.g / c.count),
          b: Math.round(c.b / c.count),
          count: c.count,
        };
      })
      .sort(function (x, y) {
        return y.count - x.count;
      });

    return mergeClose(lista, config.tolerance === undefined ? 24 : config.tolerance);
  }

  // As caixas tem bordas fixas, entao uma cor que cai bem na divisa se parte em duas
  // e perde metade do peso. Numa foto com degrade isso desmontaria a cor principal.
  function mergeClose(cores, tolerancia) {
    var saida = [];

    cores.forEach(function (cor) {
      for (var i = 0; i < saida.length; i += 1) {
        var a = saida[i];
        var distancia = Math.max(
          Math.abs(a.r - cor.r),
          Math.abs(a.g - cor.g),
          Math.abs(a.b - cor.b)
        );
        if (distancia <= tolerancia) {
          var total = a.count + cor.count;
          a.r = Math.round((a.r * a.count + cor.r * cor.count) / total);
          a.g = Math.round((a.g * a.count + cor.g * cor.count) / total);
          a.b = Math.round((a.b * a.count + cor.b * cor.count) / total);
          a.count = total;
          return;
        }
      }
      saida.push({ r: cor.r, g: cor.g, b: cor.b, count: cor.count });
    });

    return saida.sort(function (x, y) {
      return y.count - x.count;
    });
  }

  // A cor da marca nao pode ser o preto do fundo nem o branco do texto do logo:
  // procura a mais viva entre as que aparecem bastante.
  function pickVivid(cores) {
    var lista = (cores || []).slice(0, 24);
    var total = lista.reduce(function (soma, c) {
      return soma + (c.count || 1);
    }, 0);
    if (!total) return null;

    var melhor = null;
    var melhorNota = -1;

    lista.forEach(function (cor) {
      var h = rgbToHsl(cor.r, cor.g, cor.b);
      if (h.l < 0.12 || h.l > 0.92) return; // quase preto ou quase branco

      // O quanto a cor ocupa a imagem pesa mais que o quanto ela e viva: senao um
      // detalhe pequeno e saturado rouba o lugar da cor principal da marca.
      var presenca = (cor.count || 1) / total;
      var nota = h.s * 1.5 + presenca * 2 + (1 - Math.abs(h.l - 0.5)) * 0.5;

      if (nota > melhorNota) {
        melhorNota = nota;
        melhor = h;
      }
    });

    return melhor;
  }

  // Procura um segundo tom claramente diferente do primeiro, para virar o destaque.
  function pickAccent(cores, hBase) {
    var melhor = null;
    var melhorNota = -1;

    cores.slice(0, 24).forEach(function (cor) {
      var h = rgbToHsl(cor.r, cor.g, cor.b);
      if (h.s < 0.25 || h.l < 0.15 || h.l > 0.9) return;
      // Diferenca angular entre os tons, de 0 (mesma cor) a 180 (oposta).
      var distancia = Math.abs(((h.h - hBase + 540) % 360) - 180);
      if (distancia < 35) return;
      var nota = h.s + distancia / 360;
      if (nota > melhorNota) {
        melhorNota = nota;
        melhor = h;
      }
    });

    return melhor;
  }

  /**
   * Monta o tema a partir das cores encontradas.
   * O site e escuro por natureza, entao a imagem define os TONS, nao a claridade:
   * um logo branco nao pode deixar o fundo branco e o texto sumir.
   */
  function buildTheme(cores) {
    var base = pickVivid(cores || []);

    // Imagem sem nenhuma cor viva (tons de cinza): mantem o tema neutro escuro.
    var h = base ? base.h : 0;
    var saturada = base ? base.s > 0.12 : false;
    var s = saturada ? clamp(base.s, 0.45, 0.9) : 0;

    var acento = saturada ? pickAccent(cores || [], h) : null;
    var hAcento = acento ? acento.h : h + 28;
    var sAcento = acento ? clamp(acento.s, 0.5, 0.95) : s ? clamp(s + 0.1, 0, 0.95) : 0;

    return {
      brand: hsl(h, s, 0.46),
      brandDeep: hsl(h, saturada ? clamp(s + 0.05, 0, 1) : 0, 0.24),
      ember: hsl(hAcento, sAcento, 0.56),
      // Fundo e cartoes recebem so um respingo do tom, para o conjunto parecer familia.
      ink: hsl(h, saturada ? 0.22 : 0, 0.045),
      surface: hsl(h, saturada ? 0.16 : 0, 0.1),
      text: hsl(h, saturada ? 0.1 : 0, 0.96),
      muted: hsl(h, saturada ? 0.08 : 0, 0.66),
    };
  }

  // Le a imagem num canvas pequeno. So funciona no navegador.
  function fromImageUrl(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      // Sem isso o canvas fica "contaminado" e a leitura dos pixels e proibida.
      img.crossOrigin = 'anonymous';

      img.onload = function () {
        try {
          var canvas = document.createElement('canvas');
          canvas.width = SAMPLE_SIZE;
          canvas.height = SAMPLE_SIZE;
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
          var dados = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
          resolve(buildTheme(quantize(dados)));
        } catch (err) {
          // SecurityError: o servidor da imagem nao autoriza a leitura dos pixels.
          reject(new Error('bloqueada'));
        }
      };

      img.onerror = function () {
        reject(new Error('nao-carregou'));
      };

      img.src = url;
    });
  }

  return {
    SAMPLE_SIZE: SAMPLE_SIZE,
    rgbToHsl: rgbToHsl,
    hslToRgb: hslToRgb,
    toHex: toHex,
    hexToRgb: hexToRgb,
    contrastRatio: contrastRatio,
    quantize: quantize,
    mergeClose: mergeClose,
    pickVivid: pickVivid,
    pickAccent: pickAccent,
    buildTheme: buildTheme,
    fromImageUrl: fromImageUrl,
  };
});
