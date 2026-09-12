'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Palette = require('../public/shared/palette.js');

// Monta um "getImageData().data" falso a partir de [r,g,b,quantidade].
function pixels(lista) {
  const dados = [];
  lista.forEach(([r, g, b, n, a]) => {
    for (let i = 0; i < n; i += 1) dados.push(r, g, b, a === undefined ? 255 : a);
  });
  return dados;
}

const temaDe = (lista) => Palette.buildTheme(Palette.quantize(pixels(lista), { step: 1 }));
const HEX = /^#[0-9a-f]{6}$/;

/* --------------------------------- cor basica -------------------------------- */

test('conversao de cor vai e volta sem se perder', () => {
  const alvo = { r: 200, g: 30, b: 30 };
  const hsl = Palette.rgbToHsl(alvo.r, alvo.g, alvo.b);
  const volta = Palette.hslToRgb(hsl.h, hsl.s, hsl.l);
  assert.ok(Math.abs(volta.r - alvo.r) <= 1);
  assert.ok(Math.abs(volta.g - alvo.g) <= 1);
  assert.ok(Math.abs(volta.b - alvo.b) <= 1);
});

test('contraste conhecido bate com o esperado', () => {
  assert.strictEqual(Math.round(Palette.contrastRatio('#000000', '#ffffff')), 21);
  assert.strictEqual(Math.round(Palette.contrastRatio('#ffffff', '#ffffff')), 1);
});

/* -------------------------------- agrupamento -------------------------------- */

test('cores quase iguais viram uma so', () => {
  const cores = Palette.quantize(pixels([[200, 30, 30, 10], [202, 32, 28, 10]]), { step: 1 });
  assert.strictEqual(cores.length, 1);
  assert.strictEqual(cores[0].count, 20);
});

test('pixel transparente nao entra na conta', () => {
  const cores = Palette.quantize(pixels([[200, 30, 30, 10], [20, 200, 20, 10, 0]]), { step: 1 });
  assert.strictEqual(cores.length, 1);
  assert.ok(cores[0].r > 150, 'a cor visivel deveria ser a unica encontrada');
});

test('as cores saem ordenadas da mais presente para a menos', () => {
  const cores = Palette.quantize(pixels([[10, 10, 200, 5], [200, 10, 10, 30]]), { step: 1 });
  assert.ok(cores[0].r > cores[0].b, 'a cor com mais pixels deveria vir primeiro');
});

/* ----------------------------- escolha da marca ------------------------------ */

test('a cor que domina a imagem vira a marca', () => {
  // Azul ocupa mais espaco; o laranja e um detalhe pequeno, ainda que mais vivo.
  const tema = temaDe([[30, 80, 200, 50], [240, 140, 20, 8]]);
  const hsl = Palette.rgbToHsl(...Object.values(Palette.hexToRgb(tema.brand)));
  assert.ok(hsl.h > 190 && hsl.h < 260, `esperava um tom azul, veio ${tema.brand}`);
});

test('o destaque usa um segundo tom realmente diferente', () => {
  const tema = temaDe([[30, 80, 200, 50], [240, 140, 20, 30]]);
  const marca = Palette.rgbToHsl(...Object.values(Palette.hexToRgb(tema.brand)));
  const destaque = Palette.rgbToHsl(...Object.values(Palette.hexToRgb(tema.ember)));
  const diferenca = Math.abs(((destaque.h - marca.h + 540) % 360) - 180);
  assert.ok(diferenca > 35, `marca e destaque ficaram parecidos demais (${diferenca.toFixed(0)} graus)`);
});

test('preto e branco do logo nao viram a cor da marca', () => {
  const tema = temaDe([[0, 0, 0, 80], [255, 255, 255, 60], [200, 30, 30, 20]]);
  const hsl = Palette.rgbToHsl(...Object.values(Palette.hexToRgb(tema.brand)));
  assert.ok(hsl.s > 0.3, `a marca ficou sem cor: ${tema.brand}`);
  assert.ok(hsl.h < 20 || hsl.h > 340, `esperava um tom vermelho, veio ${tema.brand}`);
});

test('imagem em tons de cinza gera tema neutro, sem inventar cor', () => {
  const tema = temaDe([[120, 120, 120, 50], [240, 240, 240, 30]]);
  const marca = Palette.hexToRgb(tema.brand);
  assert.strictEqual(marca.r, marca.g);
  assert.strictEqual(marca.g, marca.b);
});

/* ------------------------- o que nao pode acontecer -------------------------- */

test('logo claro nao pode clarear o fundo e sumir com o texto', () => {
  const tema = temaDe([[255, 255, 255, 90], [250, 245, 240, 40]]);
  assert.ok(Palette.luminancia === undefined); // o site e escuro por natureza
  const fundo = Palette.rgbToHsl(...Object.values(Palette.hexToRgb(tema.ink)));
  assert.ok(fundo.l < 0.15, `o fundo ficou claro demais: ${tema.ink}`);
});

test('o texto sempre fica legivel sobre fundo e cartoes', () => {
  const amostras = [
    [[200, 30, 30, 60], [10, 10, 10, 40]],
    [[30, 80, 200, 50], [240, 140, 20, 30]],
    [[255, 255, 255, 90]],
    [[120, 120, 120, 50]],
    [[250, 230, 40, 70], [20, 20, 20, 20]],
  ];
  amostras.forEach((amostra) => {
    const tema = temaDe(amostra);
    assert.ok(
      Palette.contrastRatio(tema.text, tema.surface) >= 4.5,
      `texto ilegivel sobre o cartao em ${JSON.stringify(tema)}`
    );
    assert.ok(
      Palette.contrastRatio(tema.text, tema.ink) >= 4.5,
      `texto ilegivel sobre o fundo em ${JSON.stringify(tema)}`
    );
    assert.ok(
      Palette.contrastRatio(tema.muted, tema.surface) >= 3,
      `texto secundario ilegivel em ${JSON.stringify(tema)}`
    );
  });
});

test('todas as sete cores saem em hexadecimal valido', () => {
  const tema = temaDe([[200, 30, 30, 60]]);
  ['brand', 'brandDeep', 'ember', 'ink', 'surface', 'text', 'muted'].forEach((chave) => {
    assert.match(tema[chave], HEX, `${chave} saiu invalido: ${tema[chave]}`);
  });
});

test('imagem vazia nao quebra a deteccao', () => {
  const tema = Palette.buildTheme([]);
  assert.match(tema.brand, HEX);
  assert.match(tema.ink, HEX);
});
