'use strict';

const test = require('node:test');
const assert = require('node:assert');
const Quality = require('../public/shared/quality.js');

/* --------------------------------- a escada --------------------------------- */

test('os niveis vao do mais leve para o mais pesado', () => {
  const alturas = Quality.LEVELS.map((n) => n.height);
  const taxas = Quality.LEVELS.map((n) => n.maxBitrate);
  assert.deepStrictEqual(alturas, [...alturas].sort((a, b) => a - b));
  assert.deepStrictEqual(taxas, [...taxas].sort((a, b) => a - b));
});

test('subir e descer respeitam os limites da escada', () => {
  assert.strictEqual(Quality.step('media', -1), 'baixa');
  assert.strictEqual(Quality.step('media', 1), 'alta');
  // No topo nao sobe mais; no fundo nao desce mais.
  assert.strictEqual(Quality.step('alta', 1), 'alta');
  assert.strictEqual(Quality.step('minima', -1), 'minima');
});

test('nivel desconhecido nao quebra nada', () => {
  assert.strictEqual(Quality.isValid('ultra'), false);
  assert.strictEqual(Quality.isValid('auto'), true);
  assert.strictEqual(Quality.get('ultra').id, Quality.DEFAULT_LEVEL);
  assert.strictEqual(Quality.step('ultra', -1), 'baixa');
});

/* ------------------------------ captura e envio ------------------------------ */

test('captura sempre pede maximo, para so reduzir a tela', () => {
  const c = Quality.captureConstraints('media');
  assert.strictEqual(c.height.max, 720);
  assert.strictEqual(c.frameRate.max, 24);
  assert.ok(!('min' in c.height), 'nao pode exigir minimo de resolucao');
});

test('a reducao por espectador e relativa ao que esta sendo capturado', () => {
  // Captura em 1080p, espectador quer 540p: reduz pela metade.
  assert.strictEqual(Quality.encodingFor('baixa', 1080).scaleResolutionDownBy, 2);
  // Captura ja em 720p, mesmo pedido: reduz menos.
  assert.ok(Quality.encodingFor('baixa', 720).scaleResolutionDownBy < 2);
});

test('nunca aumenta a imagem alem do que foi capturado', () => {
  // Captura pequena e pedido de qualidade alta nao pode gerar escala menor que 1.
  assert.strictEqual(Quality.encodingFor('alta', 360).scaleResolutionDownBy, 1);
  assert.strictEqual(Quality.encodingFor('media', 540).scaleResolutionDownBy, 1);
});

/* -------------------------------- diagnostico -------------------------------- */

function amostra(extra) {
  return Object.assign(
    { framesDecoded: 0, bytesReceived: 0, packetsLost: 0, packetsReceived: 0, framesDropped: 0 },
    extra
  );
}

test('imagem parada e diagnosticada como ruim', () => {
  const antes = amostra({ framesDecoded: 100, bytesReceived: 5000 });
  const depois = amostra({ framesDecoded: 100, bytesReceived: 5000 });
  assert.strictEqual(Quality.judge(antes, depois), 'ruim');
});

test('perda alta de pacotes e ruim mesmo com a imagem andando', () => {
  const antes = amostra({ framesDecoded: 100, packetsReceived: 1000, packetsLost: 0 });
  const depois = amostra({ framesDecoded: 130, bytesReceived: 900, packetsReceived: 1100, packetsLost: 20 });
  assert.strictEqual(Quality.judge(antes, depois), 'ruim');
});

test('muitos quadros descartados sao ruins mesmo sem perda de pacote', () => {
  const antes = amostra({ framesDecoded: 100, packetsReceived: 1000 });
  const depois = amostra({ framesDecoded: 130, bytesReceived: 900, packetsReceived: 1200, framesDropped: 20 });
  assert.strictEqual(Quality.judge(antes, depois), 'ruim');
});

test('fluxo limpo e diagnosticado como bom', () => {
  const antes = amostra({ framesDecoded: 100, packetsReceived: 1000 });
  const depois = amostra({ framesDecoded: 130, bytesReceived: 9000, packetsReceived: 1300 });
  assert.strictEqual(Quality.judge(antes, depois), 'bom');
});

test('sem leitura anterior nao acusa problema', () => {
  assert.strictEqual(Quality.judge(null, amostra({ framesDecoded: 10 })), 'ok');
});

/* ------------------------------ modo automatico ------------------------------ */

function controlador(extra) {
  const mudancas = [];
  const ctrl = Quality.createAutoController(
    Object.assign({ startLevel: 'media', onChange: (n) => mudancas.push(n) }, extra)
  );
  return { ctrl, mudancas };
}

test('desce de nivel depois de duas checagens ruins seguidas', () => {
  const { ctrl, mudancas } = controlador();
  ctrl.report('ruim');
  assert.strictEqual(ctrl.level, 'media', 'uma checagem ruim nao pode derrubar a qualidade');
  ctrl.report('ruim');
  assert.strictEqual(ctrl.level, 'baixa');
  assert.deepStrictEqual(mudancas, ['baixa']);
});

test('uma checagem boa no meio zera a contagem de ruins', () => {
  const { ctrl } = controlador();
  ctrl.report('ruim');
  ctrl.report('bom');
  ctrl.report('ruim');
  assert.strictEqual(ctrl.level, 'media', 'nao pode descer com ruins nao consecutivos');
});

test('sobe de nivel so depois de muitas checagens boas', () => {
  const { ctrl, mudancas } = controlador({ startLevel: 'baixa' });
  for (let i = 0; i < 5; i += 1) ctrl.report('bom');
  assert.strictEqual(ctrl.level, 'baixa', 'subir cedo demais faz a imagem oscilar');
  ctrl.report('bom');
  assert.strictEqual(ctrl.level, 'media');
  assert.deepStrictEqual(mudancas, ['media']);
});

test('desce mais rapido do que sobe', () => {
  const { ctrl } = controlador({ startLevel: 'alta' });
  ctrl.report('ruim');
  ctrl.report('ruim');
  assert.strictEqual(ctrl.level, 'media');
  // Voltar para alta exige bem mais evidencia do que foi preciso para cair.
  for (let i = 0; i < 5; i += 1) ctrl.report('bom');
  assert.strictEqual(ctrl.level, 'media');
});

test('nao desce abaixo do minimo por mais que trave', () => {
  const { ctrl } = controlador({ startLevel: 'minima' });
  for (let i = 0; i < 20; i += 1) ctrl.report('ruim');
  assert.strictEqual(ctrl.level, 'minima');
});

test('reset volta ao nivel pedido e zera as contagens', () => {
  const { ctrl } = controlador();
  ctrl.report('ruim');
  ctrl.reset('alta');
  assert.strictEqual(ctrl.level, 'alta');
  ctrl.report('ruim');
  assert.strictEqual(ctrl.level, 'alta', 'a contagem anterior nao pode ter sobrado');
});
