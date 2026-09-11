'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { sanitizeColors, sanitizeMediaUrl } = require('../lib/branding');

test('aceita apenas cores hexadecimais validas', () => {
  const atual = { brand: '#e11d1d', ink: '#0b0b0d' };
  const novo = sanitizeColors({ brand: '#00ff00', ink: 'javascript:alert(1)', ember: '#abc' }, atual);
  assert.strictEqual(novo.brand, '#00ff00');
  assert.strictEqual(novo.ink, '#0b0b0d');
  assert.strictEqual(novo.ember, '#abc');
});

test('ignora chaves de cor desconhecidas', () => {
  const novo = sanitizeColors({ hacker: '#000000' }, { brand: '#e11d1d' });
  assert.deepStrictEqual(novo, { brand: '#e11d1d' });
});

test('midia aceita arquivo enviado e link externo http(s)', () => {
  assert.strictEqual(sanitizeMediaUrl('/uploads/abc.png'), '/uploads/abc.png');
  assert.strictEqual(sanitizeMediaUrl('https://cdn.exemplo.com/logo.png'), 'https://cdn.exemplo.com/logo.png');
  assert.strictEqual(sanitizeMediaUrl('http://exemplo.com/f.mp4'), 'http://exemplo.com/f.mp4');
  assert.strictEqual(sanitizeMediaUrl('  '), '');
});

test('midia recusa esquema perigoso ou caminho de fora de uploads', () => {
  assert.strictEqual(sanitizeMediaUrl('javascript:alert(1)'), null);
  assert.strictEqual(sanitizeMediaUrl('data:text/html,<script>'), null);
  assert.strictEqual(sanitizeMediaUrl('/etc/passwd'), null);
});

/* ------------------------ identidade visual por sala ------------------------ */

const { mergeBranding, sanitizeEffects, sanitizeSparkRate } = require('../lib/branding');

function brandingGlobal() {
  return {
    siteName: 'Tela Bombeiros',
    tagline: 'ao vivo',
    colors: { brand: '#e11d1d', ink: '#0b0b0d', text: '#f5f5f7' },
    logoUrl: '/uploads/logo-site.png',
    backgroundUrl: '',
    videoUrl: '',
    effects: { spotlight: true, sparks: true, sparkRate: 20 },
    updatedAt: null,
  };
}

test('a sala sobrepoe so o que preencheu; o resto vem do site', () => {
  const merged = mergeBranding(brandingGlobal(), {
    colors: { brand: '#0055ff' },
    logoUrl: '',
    backgroundUrl: 'https://cdn.exemplo.com/fundo.jpg',
  });

  assert.strictEqual(merged.colors.brand, '#0055ff');
  assert.strictEqual(merged.colors.ink, '#0b0b0d');
  assert.strictEqual(merged.logoUrl, '/uploads/logo-site.png');
  assert.strictEqual(merged.backgroundUrl, 'https://cdn.exemplo.com/fundo.jpg');
});

test('sala sem identidade propria fica identica ao site', () => {
  const global = brandingGlobal();
  assert.deepStrictEqual(mergeBranding(global, {}).colors, global.colors);
  assert.deepStrictEqual(mergeBranding(global, undefined).colors, global.colors);
  assert.strictEqual(mergeBranding(global, { colors: {}, logoUrl: '' }).logoUrl, global.logoUrl);
});

test('a identidade de uma sala nao vaza para o site nem para outra sala', () => {
  const global = brandingGlobal();

  const salaA = mergeBranding(global, { colors: { brand: '#00ff00' }, logoUrl: 'https://a/a.png' });
  const salaB = mergeBranding(global, { colors: {}, logoUrl: '' });

  assert.strictEqual(salaA.colors.brand, '#00ff00');
  // O objeto global nao pode ter sido alterado pela mesclagem da sala A.
  assert.strictEqual(global.colors.brand, '#e11d1d');
  assert.strictEqual(global.logoUrl, '/uploads/logo-site.png');
  // E a sala B, que nao configurou nada, continua com a aparencia do site.
  assert.strictEqual(salaB.colors.brand, '#e11d1d');
  assert.strictEqual(salaB.logoUrl, '/uploads/logo-site.png');
});

test('cor invalida vinda da sala e descartada', () => {
  const merged = mergeBranding(brandingGlobal(), {
    colors: sanitizeColors({ brand: 'url(javascript:alert(1))' }, {}),
  });
  assert.strictEqual(merged.colors.brand, '#e11d1d');
});

/* ----------------------- quantidade de fagulhas ----------------------- */

test('a barra de fagulhas fica sempre entre 0 e 100', () => {
  assert.strictEqual(sanitizeSparkRate(150, 20), 100);
  assert.strictEqual(sanitizeSparkRate(-40, 20), 0);
  assert.strictEqual(sanitizeSparkRate('35', 20), 35);
  assert.strictEqual(sanitizeSparkRate(12.6, 20), 13);
});

test('valor sem sentido mantem a quantidade atual', () => {
  assert.strictEqual(sanitizeSparkRate('muitas', 30), 30);
  assert.strictEqual(sanitizeSparkRate(undefined, 30), 30);
  assert.strictEqual(sanitizeSparkRate(null, 30), 30);
});

test('efeitos guardam desligado e quantidade juntos', () => {
  const efeitos = sanitizeEffects({ spotlight: false, sparks: true, sparkRate: 80 }, { sparkRate: 20 });
  assert.deepStrictEqual(efeitos, { spotlight: false, sparks: true, sparkRate: 80 });

  // Desligar as fagulhas nao apaga a quantidade escolhida.
  const desligado = sanitizeEffects({ spotlight: true, sparks: false }, { sparkRate: 80 });
  assert.strictEqual(desligado.sparks, false);
  assert.strictEqual(desligado.sparkRate, 80);
});
