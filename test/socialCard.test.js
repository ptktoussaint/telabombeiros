'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { buildSocialCard, escapeAttr, absoluteUrl } = require('../lib/socialCard');

const BASE = 'https://telabombeiros.onrender.com';

test('monta o cartao com titulo, descricao e cor da marca', () => {
  const html = buildSocialCard(
    { siteName: 'Tela Bombeiros', tagline: 'Transmissao ao vivo', colors: { brand: '#e11d1d' } },
    BASE
  );
  assert.match(html, /property="og:title" content="Tela Bombeiros"/);
  assert.match(html, /property="og:description" content="Transmissao ao vivo"/);
  assert.match(html, /name="theme-color" content="#e11d1d"/);
  assert.match(html, /property="og:url" content="https:\/\/telabombeiros\.onrender\.com"/);
});

test('imagem enviada pelo painel vira endereco absoluto', () => {
  const html = buildSocialCard({ shareImageUrl: '/uploads/card.png' }, BASE);
  assert.match(html, /property="og:image" content="https:\/\/telabombeiros\.onrender\.com\/uploads\/card\.png"/);
  assert.match(html, /twitter:card" content="summary_large_image"/);
});

test('link externo de imagem e usado como esta', () => {
  const html = buildSocialCard({ shareImageUrl: 'https://cdn.exemplo.com/card.png' }, BASE);
  assert.match(html, /property="og:image" content="https:\/\/cdn\.exemplo\.com\/card\.png"/);
});

test('sem imagem propria usa o logo; sem nenhum dos dois, nao inventa imagem', () => {
  const comLogo = buildSocialCard({ logoUrl: '/uploads/logo.png' }, BASE);
  assert.match(comLogo, /og:image" content="https:\/\/telabombeiros\.onrender\.com\/uploads\/logo\.png"/);

  const semNada = buildSocialCard({}, BASE);
  assert.ok(!semNada.includes('og:image'));
  assert.match(semNada, /twitter:card" content="summary"/);
});

test('nome com aspas ou sinal de maior nao quebra o HTML do cartao', () => {
  const html = buildSocialCard({ siteName: 'Sala "A" <script>', tagline: 'a & b' }, BASE);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /og:title" content="Sala &quot;A&quot; &lt;script&gt;"/);
  assert.match(html, /og:description" content="a &amp; b"/);
});

test('escapes e montagem de endereco absoluto', () => {
  assert.strictEqual(escapeAttr('a"b'), 'a&quot;b');
  assert.strictEqual(escapeAttr(null), '');
  assert.strictEqual(absoluteUrl(BASE + '/', '/x.png'), BASE + '/x.png');
  assert.strictEqual(absoluteUrl(BASE, 'x.png'), BASE + '/x.png');
  assert.strictEqual(absoluteUrl(BASE, ''), '');
});
