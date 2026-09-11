'use strict';

// Discord, WhatsApp e afins nao executam JavaScript: o tema aplicado no navegador
// nao existe para eles. Por isso estas marcas sao montadas no servidor, na hora.
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const FALLBACK_TITLE = 'Tela Bombeiros';
const FALLBACK_DESCRIPTION = 'Transmissao de tela ao vivo';

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

function buildSocialCard({ title, description, image, themeColor, siteName, url } = {}) {
  const finalTitle = title || FALLBACK_TITLE;
  const finalDescription = description || FALLBACK_DESCRIPTION;

  const tags = [
    `<meta name="description" content="${escapeAttr(finalDescription)}" />`,
    // O Discord usa esta cor na barra lateral do cartao.
    `<meta name="theme-color" content="${escapeAttr(themeColor || '#e11d1d')}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeAttr(siteName || finalTitle)}" />`,
    `<meta property="og:title" content="${escapeAttr(finalTitle)}" />`,
    `<meta property="og:description" content="${escapeAttr(finalDescription)}" />`,
    `<meta property="og:url" content="${escapeAttr(url || '')}" />`,
  ];

  if (image) {
    tags.push(
      `<meta property="og:image" content="${escapeAttr(image)}" />`,
      `<meta property="og:image:width" content="${CARD_WIDTH}" />`,
      `<meta property="og:image:height" content="${CARD_HEIGHT}" />`,
      `<meta property="og:image:alt" content="${escapeAttr(finalTitle)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${escapeAttr(image)}" />`
    );
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`);
  }

  tags.push(
    `<meta name="twitter:title" content="${escapeAttr(finalTitle)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(finalDescription)}" />`
  );

  return tags.join('\n  ');
}

// Cartao do site: titulo e subtitulo proprios, com o nome e a frase do site como reserva.
function buildSiteCard(branding = {}, baseUrl = '') {
  return buildSocialCard({
    title: branding.shareTitle || branding.siteName,
    description: branding.shareDescription || branding.tagline,
    image: absoluteUrl(baseUrl, branding.shareImageUrl || branding.logoUrl),
    themeColor: branding.colors && branding.colors.brand,
    siteName: branding.siteName,
    url: baseUrl,
  });
}

// Cartao do convite: nome da sala como titulo e o nome do convite como subtitulo,
// nas cores que o dono daquela sala escolheu.
function buildInviteCard({ roomLabel, inviteLabel, branding = {}, baseUrl = '', url = '' } = {}) {
  return buildSocialCard({
    title: roomLabel,
    description: inviteLabel ? `Convite de: ${inviteLabel}` : 'Voce foi convidado para assistir',
    image: absoluteUrl(baseUrl, branding.logoUrl || branding.shareImageUrl),
    themeColor: branding.colors && branding.colors.brand,
    siteName: branding.siteName,
    url: url || baseUrl,
  });
}

module.exports = {
  buildSocialCard,
  buildSiteCard,
  buildInviteCard,
  escapeAttr,
  absoluteUrl,
  CARD_WIDTH,
  CARD_HEIGHT,
};
