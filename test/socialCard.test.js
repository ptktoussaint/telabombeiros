'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  buildSocialCard,
  buildSiteCard,
  buildInviteCard,
  escapeAttr,
  absoluteUrl,
} = require('../lib/socialCard');
const { mergeBranding, serializeBranding } = require('../lib/branding');

const BASE = 'https://telabombeiros.onrender.com';

/* ------------------------------- cartao do site ------------------------------- */

test('titulo e subtitulo proprios do cartao tem prioridade sobre o nome do site', () => {
  const html = buildSiteCard(
    {
      siteName: 'Tela Bombeiros',
      tagline: 'Transmissao de tela ao vivo',
      shareTitle: 'Central de Transmissoes',
      shareDescription: 'Acompanhe as operacoes em tempo real',
      colors: { brand: '#e11d1d' },
    },
    BASE
  );
  assert.match(html, /og:title" content="Central de Transmissoes"/);
  assert.match(html, /og:description" content="Acompanhe as operacoes em tempo real"/);
  // O nome do site continua identificando a origem no cartao.
  assert.match(html, /og:site_name" content="Tela Bombeiros"/);
});

test('cartao sem titulo proprio cai no nome e na frase do site', () => {
  const html = buildSiteCard({ siteName: 'Tela Bombeiros', tagline: 'Ao vivo' }, BASE);
  assert.match(html, /og:title" content="Tela Bombeiros"/);
  assert.match(html, /og:description" content="Ao vivo"/);
});

test('sem nada configurado o cartao ainda sai valido', () => {
  const html = buildSiteCard({}, BASE);
  assert.match(html, /og:title" content="Tela Bombeiros"/);
  assert.match(html, /theme-color" content="#e11d1d"/);
  assert.ok(!html.includes('og:image'));
});

/* ------------------------------ cartao do convite ----------------------------- */

test('convite mostra o nome da sala, o nome do convite e a cor da sala', () => {
  const html = buildInviteCard({
    roomLabel: 'Operacoes - Turno 1',
    inviteLabel: 'Joao Silva',
    branding: { colors: { brand: '#0055ff' }, logoUrl: '/uploads/logo.png', siteName: 'Tela Bombeiros' },
    baseUrl: BASE,
    url: BASE + '/v/abc123',
  });
  assert.match(html, /og:title" content="Operacoes - Turno 1"/);
  assert.match(html, /og:description" content="Convite de: Joao Silva"/);
  assert.match(html, /theme-color" content="#0055ff"/);
  assert.match(html, /og:image" content="https:\/\/telabombeiros\.onrender\.com\/uploads\/logo\.png"/);
  // O endereco do cartao nunca leva o token junto.
  assert.match(html, /og:url" content="https:\/\/telabombeiros\.onrender\.com\/v\/abc123"/);
  assert.ok(!html.includes('?t='));
});

test('convite sem nome de convidado nao mostra "Convite de:" vazio', () => {
  const html = buildInviteCard({ roomLabel: 'Sala 2', branding: {}, baseUrl: BASE });
  assert.match(html, /og:description" content="Voce foi convidado para assistir"/);
  assert.ok(!html.includes('Convite de:'));
});

test('a cor do cartao do convite vem da sala, nao do site', () => {
  const global = serializeBranding({
    siteName: 'Tela Bombeiros',
    tagline: 't',
    colors: { brand: '#e11d1d', ink: '#0b0b0d' },
    logoUrl: '',
    backgroundUrl: '',
    videoUrl: '',
    shareImageUrl: '',
    shareTitle: '',
    shareDescription: '',
    effects: {},
    updatedAt: null,
  });
  const daSala = mergeBranding(global, { colors: { brand: '#00aa55' } });
  const html = buildInviteCard({ roomLabel: 'Sala', inviteLabel: 'Ana', branding: daSala, baseUrl: BASE });
  assert.match(html, /theme-color" content="#00aa55"/);
});

/* ----------------------------- seguranca e formato ---------------------------- */

test('nome de sala com HTML nao escapa para dentro da pagina', () => {
  const html = buildInviteCard({
    roomLabel: 'Sala "A" <script>alert(1)</script>',
    inviteLabel: 'a & b',
    branding: {},
    baseUrl: BASE,
  });
  assert.ok(!html.includes('<script>'));
  assert.match(html, /og:title" content="Sala &quot;A&quot; &lt;script&gt;/);
  assert.match(html, /og:description" content="Convite de: a &amp; b"/);
});

test('imagem enviada vira endereco absoluto; link externo fica como esta', () => {
  assert.match(
    buildSiteCard({ shareImageUrl: '/uploads/card.png' }, BASE),
    /og:image" content="https:\/\/telabombeiros\.onrender\.com\/uploads\/card\.png"/
  );
  assert.match(
    buildSiteCard({ shareImageUrl: 'https://cdn.exemplo.com/card.png' }, BASE),
    /og:image" content="https:\/\/cdn\.exemplo\.com\/card\.png"/
  );
});

test('com imagem o cartao e grande; sem imagem e o compacto', () => {
  assert.match(buildSiteCard({ logoUrl: '/uploads/l.png' }, BASE), /twitter:card" content="summary_large_image"/);
  assert.match(buildSiteCard({}, BASE), /twitter:card" content="summary"/);
});

test('escapes e montagem de endereco absoluto', () => {
  assert.strictEqual(escapeAttr('a"b'), 'a&quot;b');
  assert.strictEqual(escapeAttr(null), '');
  assert.strictEqual(absoluteUrl(BASE + '/', '/x.png'), BASE + '/x.png');
  assert.strictEqual(absoluteUrl(BASE, 'x.png'), BASE + '/x.png');
  assert.strictEqual(absoluteUrl(BASE, ''), '');
});

test('buildSocialCard aceita ser chamado sem nenhum dado', () => {
  const html = buildSocialCard();
  assert.match(html, /og:title" content="Tela Bombeiros"/);
});
