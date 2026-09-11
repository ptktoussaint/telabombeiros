'use strict';

// Discord, WhatsApp e afins nao executam JavaScript: o tema aplicado no navegador
// nao existe para eles. Por isso estas marcas sao montadas no servidor, na hora.
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

function escapeAttr(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function absoluteUrl(base, url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${String(base).replace(/\/+$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

function buildSocialCard(branding = {}, baseUrl = '') {
  const title = branding.siteName || 'Tela Bombeiros';
  const description = branding.tagline || 'Transmissao de tela ao vivo';
  const image = absoluteUrl(baseUrl, branding.shareImageUrl || branding.logoUrl || '');
  const themeColor = (branding.colors && branding.colors.brand) || '#e11d1d';

  const tags = [
    `<meta name="description" content="${escapeAttr(description)}" />`,
    // O Discord usa esta cor na barra lateral do cartao.
    `<meta name="theme-color" content="${escapeAttr(themeColor)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeAttr(title)}" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${escapeAttr(baseUrl)}" />`,
  ];

  if (image) {
    tags.push(
      `<meta property="og:image" content="${escapeAttr(image)}" />`,
      `<meta property="og:image:width" content="${CARD_WIDTH}" />`,
      `<meta property="og:image:height" content="${CARD_HEIGHT}" />`,
      `<meta property="og:image:alt" content="${escapeAttr(title)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${escapeAttr(image)}" />`
    );
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`);
  }

  tags.push(
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`
  );

  return tags.join('\n  ');
}

module.exports = { buildSocialCard, escapeAttr, absoluteUrl, CARD_WIDTH, CARD_HEIGHT };
