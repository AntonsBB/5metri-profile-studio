import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { productRoute, toSeoSlug } from './store-routes.mjs';

const SITE_URL = String(process.env.SITE_URL || 'https://5metri.com').replace(/\/$/, '');
const SITE_NAME = '5 METRI';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storeSource = path.join(repoRoot, 'led-katalogs');
const distDir = path.join(repoRoot, 'dist');

if (distDir !== path.resolve(repoRoot, 'dist') || !storeSource.startsWith(repoRoot)) {
  throw new Error('Refusing to build outside the repository dist directory.');
}

const categoryNames = {
  shadow: 'Ēnu šuvju profili',
  separator: 'Dalījuma profili',
  led: 'LED profili',
  aluminium: 'Alumīnija profili',
  mini: 'MINI profili',
  decorative: 'Dekoratīvie profili',
  floor: 'Grīdas profili',
  tile: 'Flīžu profili',
  skirting: 'Grīdlīstes',
  pvc: 'PVC profili'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(value) {
  return escapeHtml(value);
}

function jsonForHtml(value) {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

function compactText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function truncateAtWord(value, maxLength) {
  const text = compactText(value);
  if (text.length <= maxLength) return text;
  const candidate = text.slice(0, Math.max(1, maxLength - 1));
  const boundary = candidate.lastIndexOf(' ');
  return `${candidate.slice(0, boundary > maxLength * 0.65 ? boundary : candidate.length).trim()}…`;
}

function categoryName(category) {
  return categoryNames[category] || 'Profili';
}

function isQuoted(product) {
  return product?.availability === 'quote' || !Number.isFinite(product?.price);
}

function imagePath(product, image = product.images?.[0]) {
  if (/^https:\/\//i.test(image || '')) return image;
  return `assets/products/${product.slug}/${image}`;
}

function absoluteImageUrl(product, image = product.images?.[0]) {
  const source = imagePath(product, image);
  return /^https:\/\//i.test(source) ? source : `${SITE_URL}/${source.replace(/^\/+/, '')}`;
}

function money(value) {
  return new Intl.NumberFormat('lv-LV', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function productTitle(product) {
  const suffix = ` (${product.id}) | ${SITE_NAME}`;
  return `${truncateAtWord(product.name, Math.max(28, 68 - suffix.length))}${suffix}`;
}

function productMetaDescription(product) {
  const ending = isQuoted(product)
    ? `Pieprasi cenu un konsultāciju ${SITE_NAME} Rīgā.`
    : `Cena pieejama 2 m un 3 m garumiem. Droša apmaksa tiešsaistē.`;
  return truncateAtWord(`${product.description} ${product.finish}. ${ending}`, 158);
}

function stripBuildSeo(html) {
  return html
    .replace(/\s*<!-- build:seo:start -->[\s\S]*?<!-- build:seo:end -->\s*/gi, '\n')
    .replace(/\s*<base\b[^>]*>\s*/gi, '\n')
    .replace(/\s*<link\b[^>]*\brel=["']canonical["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<meta\b[^>]*(?:name|property)=["'](?:robots|googlebot|og:[^"']+|twitter:[^"']+)["'][^>]*>\s*/gi, '\n')
    .replace(/\s*<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>\s*/gi, '\n');
}

function setDocumentTitle(html, title) {
  if (!/<title>[\s\S]*?<\/title>/i.test(html)) throw new Error('Missing document title.');
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function setMetaDescription(html, description) {
  const tag = `<meta name="description" content="${escapeHtml(description)}">`;
  if (/<meta\b[^>]*\bname=["']description["'][^>]*>/i.test(html)) {
    return html.replace(/<meta\b[^>]*\bname=["']description["'][^>]*>/i, tag);
  }
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function injectHead(html, content) {
  if (!html.includes('</head>')) throw new Error('Missing closing head tag.');
  return html.replace('</head>', `${content}\n</head>`);
}

function injectDocumentBase(html, href) {
  if (!/<head\b[^>]*>/i.test(html)) throw new Error('Missing opening head tag.');
  return html.replace(/<head\b[^>]*>/i, match => `${match}\n  <base href="${escapeHtml(href)}">`);
}

function findElement(html, id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openPattern = new RegExp(`<([a-z][a-z0-9-]*)\\b[^>]*\\bid=["']${escapedId}["'][^>]*>`, 'i');
  const match = openPattern.exec(html);
  if (!match) throw new Error(`Missing #${id}.`);
  const tag = match[1].toLowerCase();
  const openStart = match.index;
  const openEnd = match.index + match[0].length;
  if (tag === 'img' || tag === 'input' || tag === 'meta' || tag === 'link') {
    return { tag, openStart, openEnd, closeStart: openEnd, closeEnd: openEnd, openTag: match[0] };
  }
  const tokenPattern = new RegExp(`<\\/?${tag}\\b[^>]*>`, 'gi');
  tokenPattern.lastIndex = openEnd;
  let depth = 1;
  let token;
  while ((token = tokenPattern.exec(html))) {
    if (/^<\//.test(token[0])) depth -= 1;
    else depth += 1;
    if (depth === 0) {
      return {
        tag,
        openStart,
        openEnd,
        closeStart: token.index,
        closeEnd: token.index + token[0].length,
        openTag: match[0]
      };
    }
  }
  throw new Error(`Missing closing tag for #${id}.`);
}

function replaceElementContent(html, id, content) {
  const element = findElement(html, id);
  return `${html.slice(0, element.openEnd)}${content}${html.slice(element.closeStart)}`;
}

function updateOpenTag(html, id, updater) {
  const element = findElement(html, id);
  const updated = updater(element.openTag);
  return `${html.slice(0, element.openStart)}${updated}${html.slice(element.openEnd)}`;
}

function setAttribute(tag, name, value) {
  const attributePattern = new RegExp(`\\s${name}=(?:"[^"]*"|'[^']*')`, 'i');
  const attribute = ` ${name}="${escapeHtml(value)}"`;
  if (attributePattern.test(tag)) return tag.replace(attributePattern, attribute);
  return tag.replace(/\s*\/?\>$/, match => `${attribute}${match}`);
}

function setBooleanAttribute(tag, name, enabled) {
  const attributePattern = new RegExp(`\\s${name}(?:=(?:"[^"]*"|'[^']*'|[^\\s>]+))?`, 'i');
  const without = tag.replace(attributePattern, '');
  return enabled ? without.replace(/\s*\/?\>$/, match => ` ${name}${match}`) : without;
}

function setBodyProductId(html, productId) {
  if (!/<body\b[^>]*>/i.test(html)) throw new Error('Missing body tag.');
  return html.replace(/<body\b[^>]*>/i, tag => setAttribute(tag, 'data-product-id', productId));
}

function replaceLegacyStoreLinks(html, productsById) {
  let result = html
    .replace(/href=["']https:\/\/5metri\.lv\/["']/gi, 'href="/"')
    .replace(/href=["']\.\.\/["']/gi, 'href="studio/"');
  result = result.replace(/href=(["'])product\.html\?id=([^"'&]+)(?:&[^"']*)?\1/gi, (_full, quote, id) => {
    const product = productsById.get(decodeURIComponent(id).toUpperCase());
    return product ? `href=${quote}${productRoute(product).replace(/^\//, '')}${quote}` : `href=${quote}./${quote}`;
  });
  return result;
}

function productCard(product) {
  const quoted = isQuoted(product);
  const category = categoryName(product.category);
  const finish = product.finish || category;
  const categoryMeta = compactText(finish).toLocaleLowerCase('lv') === compactText(category).toLocaleLowerCase('lv')
    ? ''
    : `<span>${escapeHtml(category)}</span>`;
  const price = quoted
    ? '<span class="product-card__price product-card__price--quote"><b>Cena pēc pieprasījuma</b><small>Saņemt individuālu piedāvājumu</small></span>'
    : `<span class="product-card__price"><b>${escapeHtml(money(product.price))}</b><small>par metru bez PVN</small></span>`;
  const href = productRoute(product).replace(/^\//, '');
  return `
    <article class="product-card">
      <a class="product-card__image" href="${href}">
        <img src="${escapeHtml(imagePath(product))}" alt="${escapeHtml(`${product.name}, ${finish}`)}" loading="lazy">
        <span class="product-card__badge">${escapeHtml(category)}</span>
        <span class="image-count" aria-label="${product.images.length} attēli">${product.images.length}</span>
      </a>
      <div class="product-card__body">
        <div class="product-card__meta"><span>${escapeHtml(product.id)}</span><span>${escapeHtml(product.dimensions)}</span></div>
        <h3><a href="${href}">${escapeHtml(product.name)}</a></h3>
        <p class="product-card__finish"><span>${escapeHtml(finish)}</span>${categoryMeta}</p>
        <div class="product-card__footer">${price}<a class="product-card__link" href="${href}">Apskatīt</a></div>
      </div>
    </article>`;
}

function organizationNode() {
  return {
    '@type': 'OnlineStore',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    legalName: 'SIA “5 METRI”',
    url: `${SITE_URL}/`,
    logo: `${SITE_URL}/assets/5metri-logo.png`,
    identifier: '40103297271',
    email: 'helena@5metri.lv',
    telephone: '+37129140878',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Vienības gatve 31–1',
      addressLocality: 'Rīga',
      postalCode: 'LV-1004',
      addressCountry: 'LV'
    },
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer service',
      email: 'helena@5metri.lv',
      telephone: '+37129140878',
      availableLanguage: ['lv']
    }
  };
}

function breadcrumbNode(product, route) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${SITE_URL}${route}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Veikals', item: `${SITE_URL}/` },
      { '@type': 'ListItem', position: 2, name: product.name, item: `${SITE_URL}${route}` }
    ]
  };
}

function productNode(product, route) {
  const node = {
    '@type': 'Product',
    '@id': `${SITE_URL}${route}#product`,
    url: `${SITE_URL}${route}`,
    mainEntityOfPage: `${SITE_URL}${route}`,
    name: product.name,
    description: product.description,
    sku: product.id,
    image: product.images.map(image => absoluteImageUrl(product, image)),
    category: categoryName(product.category),
    size: product.dimensions,
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Apdare', value: product.finish },
      ...(product.details || []).map((value, index) => ({
        '@type': 'PropertyValue',
        name: `${index + 1}. tehniskā īpašība`,
        value
      }))
    ]
  };
  if (!isQuoted(product)) {
    node.offers = [2, 3].map(length => ({
      '@type': 'Offer',
      name: `${length} m profils`,
      url: `${SITE_URL}${route}`,
      price: (product.price * length * 1.21).toFixed(2),
      priceCurrency: 'EUR',
      seller: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: `${SITE_URL}/`
      }
    }));
  }
  return node;
}

function homeSeoBlock() {
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        name: SITE_NAME,
        alternateName: '5metri',
        url: `${SITE_URL}/`,
        inLanguage: 'lv-LV',
        publisher: { '@id': `${SITE_URL}/#organization` }
      },
      organizationNode()
    ]
  };
  return `
  <!-- build:seo:start -->
  <link rel="canonical" href="${SITE_URL}/">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta property="og:title" content="Alumīnija profili telpai ar precīzu raksturu | 5 METRI">
  <meta property="og:description" content="176 alumīnija, LED, ēnu šuvju, grīdas, flīžu un apdares profili vienuviet.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE_URL}/">
  <meta property="og:image" content="${SITE_URL}/assets/products/d23-w/01.jpg">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="lv_LV">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonForHtml(graph)}</script>
  <!-- build:seo:end -->`;
}

function productSeoBlock(product) {
  const route = productRoute(product);
  const currentUrl = `${SITE_URL}${route}`;
  const canonical = isQuoted(product) && /^https:\/\//i.test(product.sourceUrl || '')
    ? product.sourceUrl
    : currentUrl;
  const robots = isQuoted(product) ? 'noindex,follow' : 'index,follow,max-image-preview:large';
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [breadcrumbNode(product, route), productNode(product, route)]
  };
  return `
  <!-- build:seo:start -->
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta name="robots" content="${robots}">
  <meta property="og:title" content="${escapeHtml(productTitle(product))}">
  <meta property="og:description" content="${escapeHtml(productMetaDescription(product))}">
  <meta property="og:type" content="product">
  <meta property="og:url" content="${currentUrl}">
  <meta property="og:image" content="${escapeHtml(absoluteImageUrl(product))}">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="lv_LV">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonForHtml(graph)}</script>
  <!-- build:seo:end -->`;
}

function buildHome(source, products, productsById) {
  let html = stripBuildSeo(source);
  html = setDocumentTitle(html, 'Alumīnija profili telpai ar precīzu raksturu | 5 METRI');
  html = setMetaDescription(html, '5 METRI alumīnija profilu veikals: LED, ēnu šuvju, grīdas, flīžu un dekoratīvie profili, kā arī individuāla 3D profilu izstrāde.');
  html = injectHead(html, homeSeoBlock());
  try {
    html = replaceElementContent(html, 'featuredGrid', products.filter(product => !isQuoted(product)).map(productCard).join(''));
  } catch (error) {
    if (!String(error.message).includes('Missing #featuredGrid')) throw error;
  }
  html = replaceElementContent(html, 'productGrid', products.slice(0, 24).map(productCard).join(''));
  const alphabeticalIndex = [...products]
    .sort((left, right) => left.name.localeCompare(right.name, 'lv') || left.id.localeCompare(right.id, 'lv'))
    .map(product => `<a href="${productRoute(product).replace(/^\//, '')}"><span>${escapeHtml(product.name)}</span><small>${escapeHtml(product.id)}</small></a>`)
    .join('');
  html = replaceElementContent(html, 'staticProductIndex', alphabeticalIndex);
  html = replaceLegacyStoreLinks(html, productsById);
  return html;
}

function buildProductPage(source, product, products, productsById) {
  const quoted = isQuoted(product);
  let html = stripBuildSeo(source);
  html = injectDocumentBase(html, '../../');
  html = setDocumentTitle(html, productTitle(product));
  html = setMetaDescription(html, productMetaDescription(product));
  html = injectHead(html, productSeoBlock(product));
  html = setBodyProductId(html, product.id);
  try {
    html = replaceElementContent(html, 'breadcrumbCategory', escapeHtml(categoryName(product.category)));
  } catch (error) {
    if (!String(error.message).includes('Missing #breadcrumbCategory')) throw error;
  }
  html = replaceElementContent(html, 'breadcrumbName', escapeHtml(product.name));
  html = replaceElementContent(html, 'productCode', escapeHtml(product.id));
  html = replaceElementContent(html, 'productFinish', escapeHtml(product.finish));
  html = replaceElementContent(html, 'productName', escapeHtml(product.name));
  html = replaceElementContent(html, 'productDescription', escapeHtml(product.description));

  const specs = [
    ['Produkta kods', product.id],
    ['Izmērs', product.dimensions],
    ['Kategorija', categoryName(product.category)],
    ['Kolekcija / apdare', product.finish],
    ...(product.details || []).map((detail, index) => [`${index + 1}. īpašība`, detail])
  ];
  html = replaceElementContent(html, 'productSpecs', specs.map(([label, value]) =>
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join(''));

  const related = products
    .filter(candidate => candidate.id !== product.id && candidate.category === product.category)
    .slice(0, 4);
  html = replaceElementContent(html, 'relatedGrid', related.map(productCard).join(''));

  const thumbs = product.images.map((image, index) => `
    <button class="gallery-thumb${index === 0 ? ' active' : ''}" type="button" data-gallery-index="${index}" aria-label="Atvērt ${index + 1}. attēlu">
      <img src="${escapeHtml(imagePath(product, image))}" alt="" loading="lazy">
    </button>`).join('');
  html = replaceElementContent(html, 'galleryThumbs', thumbs);
  html = updateOpenTag(html, 'productMainImage', tag => {
    let next = setAttribute(tag, 'src', imagePath(product));
    next = setAttribute(next, 'alt', `${product.name}, ${product.finish.toLowerCase()} — 1. attēls`);
    return next;
  });
  html = replaceElementContent(html, 'galleryCounter', `1 / ${product.images.length}`);

  html = updateOpenTag(html, 'quotePanel', tag => setBooleanAttribute(tag, 'hidden', !quoted));
  html = updateOpenTag(html, 'purchaseForm', tag => setBooleanAttribute(tag, 'hidden', quoted));
  html = updateOpenTag(html, 'detailPrice', tag => setBooleanAttribute(tag, 'hidden', quoted));

  if (quoted) {
    const subject = `Cenas pieprasījums: ${product.name}`;
    const body = `Labdien!\n\nVēlos saņemt cenas piedāvājumu produktam “${product.name}” (${product.id}).\n\nNepieciešamais izmērs / daudzums:\n`;
    html = updateOpenTag(html, 'quoteLink', tag => setAttribute(tag, 'href', `mailto:helena@5metri.lv?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`));
    try {
      html = replaceElementContent(html, 'mobileActionLabel', 'Cena pēc pieprasījuma');
      html = replaceElementContent(html, 'mobileActionPrice', 'Individuāli');
      html = replaceElementContent(html, 'mobileActionButton', 'Pieprasīt cenu');
    } catch (error) {
      if (!String(error.message).includes('Missing #mobileAction')) throw error;
    }
  } else {
    html = replaceElementContent(html, 'productPrice', escapeHtml(money(product.price)));
    html = replaceElementContent(html, 'productGrossPrice', `${escapeHtml(money(product.price * 1.21))} / m ar PVN`);
    html = replaceElementContent(html, 'price2m', `${escapeHtml(money(product.price * 2 * 1.21))} ar PVN`);
    html = replaceElementContent(html, 'price3m', `${escapeHtml(money(product.price * 3 * 1.21))} ar PVN`);
    html = replaceElementContent(html, 'lineTotal', `${escapeHtml(money(product.price * 2 * 1.21))} ar PVN`);
    try {
      html = replaceElementContent(html, 'mobileActionLabel', '2 m ar PVN');
      html = replaceElementContent(html, 'mobileActionPrice', escapeHtml(money(product.price * 2 * 1.21)));
      html = replaceElementContent(html, 'mobileActionButton', 'Izvēlēties');
    } catch (error) {
      if (!String(error.message).includes('Missing #mobileAction')) throw error;
    }
  }

  html = replaceLegacyStoreLinks(html, productsById);
  return html;
}

function buildStudio(source) {
  let html = stripBuildSeo(source);
  html = setDocumentTitle(html, '3D alumīnija profilu konfigurators | 5 METRI');
  html = setMetaDescription(html, 'Uzzīmē alumīnija profila šķērsgriezumu milimetru režģī, maini garumu un apdari, apskati pilna garuma 3D modeli un nosūti ražošanas pieprasījumu.');
  const graph = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    '@id': `${SITE_URL}/studio/#application`,
    name: '5 METRI Profilu studija',
    url: `${SITE_URL}/studio/`,
    applicationCategory: 'DesignApplication',
    operatingSystem: 'Web',
    browserRequirements: 'Requires JavaScript and WebGL',
    inLanguage: 'lv-LV',
    description: 'Tiešsaistes alumīnija profilu konfigurators ar milimetru rasējumu, pilna garuma 3D modeli un ražošanas pieprasījumu.',
    provider: { '@id': `${SITE_URL}/#organization` }
  };
  const block = `
  <!-- build:seo:start -->
  <link rel="canonical" href="${SITE_URL}/studio/">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <meta property="og:title" content="3D alumīnija profilu konfigurators | 5 METRI">
  <meta property="og:description" content="No milimetru rasējuma līdz pilna garuma 3D alumīnija profilam vienā ekrānā.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${SITE_URL}/studio/">
  <meta property="og:image" content="${SITE_URL}/studio/assets/5metri-logo.png">
  <meta property="og:site_name" content="${SITE_NAME}">
  <meta property="og:locale" content="lv_LV">
  <meta name="twitter:card" content="summary_large_image">
  <script type="application/ld+json">${jsonForHtml(graph)}</script>
  <!-- build:seo:end -->`;
  html = injectHead(html, block);
  return html.replace(/data-legacy-href=["']\.\/led-katalogs\/["']/gi, 'data-legacy-href="../"');
}

function buildSuccess(source) {
  let html = stripBuildSeo(source);
  html = injectHead(html, `
  <!-- build:seo:start -->
  <meta name="robots" content="noindex,nofollow,noarchive">
  <meta name="referrer" content="no-referrer">
  <!-- build:seo:end -->`);
  return html.replace(/href=["']\.\.\/["']/gi, 'href="studio/"');
}

function redirectDocument({ title, fallback, script = '' }) {
  const refreshDelay = script ? 1 : 0;
  return `<!doctype html>
<html lang="lv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,follow,noarchive">
  <meta http-equiv="refresh" content="${refreshDelay};url=${escapeHtml(fallback)}">
  <title>${escapeHtml(title)}</title>
</head>
<body>
  <p>Lapa ir pārvietota. <a href="${escapeHtml(fallback)}">Turpināt</a></p>
  ${script}
</body>
</html>`;
}

function legacyProductRedirect(products, prefix) {
  const routes = Object.fromEntries(products.map(product => [product.id.toUpperCase(), `${prefix}${productRoute(product).replace(/^\//, '')}`]));
  const fallback = prefix || './';
  const script = `<script>
  (() => {
    const routes = ${jsonForHtml(routes)};
    const requested = new URLSearchParams(location.search).get('id');
    const target = requested ? routes[requested.toUpperCase()] : null;
    location.replace(new URL(target || ${JSON.stringify(fallback)}, location.href).href);
  })();
  </script>`;
  return redirectDocument({ title: 'Produkts ir pārvietots | 5 METRI', fallback, script });
}

function buildRobots() {
  return `User-agent: *
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;
}

function buildSitemap(products) {
  const priced = products.filter(product => !isQuoted(product));
  const urls = [
    { loc: `${SITE_URL}/` },
    { loc: `${SITE_URL}/studio/` },
    ...priced.map(product => ({ loc: `${SITE_URL}${productRoute(product)}`, images: product.images.map(image => absoluteImageUrl(product, image)) }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(entry => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>${entry.images?.map(image => `
    <image:image><image:loc>${escapeXml(image)}</image:loc></image:image>`).join('') || ''}
  </url>`).join('\n')}
</urlset>
`;
}

function buildLlms(products, full = false) {
  const priced = products.filter(product => !isQuoted(product));
  const quoted = products.filter(isQuoted);
  const intro = `# 5 METRI

> 5 METRI ir profilu interneta veikals un alumīnija profilu 3D konfigurators Rīgā, Latvijā.

- [Veikals](${SITE_URL}/): alumīnija, LED, ēnu šuvju, grīdas, flīžu, MINI, PVC un dekoratīvie profili.
- [3D profilu studija](${SITE_URL}/studio/): milimetru šķērsgriezuma rasējums, pilna garuma 3D modelis un ražošanas pieprasījums.
- Kontakti: helena@5metri.lv, +371 29 140 878, Vienības gatve 31–1, Rīga.
- Precēm ar publisku cenu iespējama Stripe apmaksa. Pārējiem produktiem tiek sagatavots individuāls piedāvājums.

## Produkti ar publisku cenu

${priced.map(product => `- [${product.name} — ${product.finish}](${SITE_URL}${productRoute(product)}): ${money(product.price)} par metru bez PVN.`).join('\n')}
`;
  if (!full) return `${intro}\n## Papildu dati\n\n- [Pilns publiskais produktu JSON](${SITE_URL}/products.json)\n- [Pilns AI kataloga indekss](${SITE_URL}/llms-full.txt)\n`;
  return `${intro}\n## Produkti ar cenu pēc pieprasījuma\n\n${quoted.map(product => `- [${product.name} — ${product.finish}](${SITE_URL}${productRoute(product)}): ${compactText(product.description)}`).join('\n')}\n`;
}

function publicProduct(product) {
  return {
    id: product.id,
    url: `${SITE_URL}${productRoute(product)}`,
    name: product.name,
    category: product.category,
    categoryName: categoryName(product.category),
    finish: product.finish,
    dimensions: product.dimensions,
    availability: isQuoted(product) ? 'quote' : 'priced',
    priceNetPerMeter: isQuoted(product) ? null : product.price,
    priceCurrency: 'EUR',
    vatRate: 0.21,
    images: product.images.map(image => absoluteImageUrl(product, image)),
    description: product.description,
    details: [...(product.details || [])]
  };
}

function buildNotFound() {
  return `<!doctype html>
<html lang="lv">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,follow">
  <meta name="theme-color" content="#ffffff">
  <title>Lapa nav atrasta | 5 METRI</title>
  <style>body{margin:0;background:#f6f6f3;color:#111;font:16px/1.6 Inter,system-ui,sans-serif}.wrap{width:min(720px,calc(100% - 40px));margin:0 auto;padding:14vh 0}.code{font-size:14px;letter-spacing:.16em;text-transform:uppercase}.wrap h1{font-size:clamp(48px,10vw,96px);line-height:.95;letter-spacing:-.06em;margin:.25em 0}.links{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}.links a{padding:12px 18px;border:1px solid #111;border-radius:999px;color:inherit;text-decoration:none}.links a:first-child{background:#111;color:#fff}</style>
</head>
<body><main class="wrap"><p class="code">404</p><h1>Lapa nav atrasta.</h1><p>Iespējams, saite ir mainīta. Atgriezies veikalā vai atver 3D profilu studiju.</p><nav class="links"><a href="/">Atvērt veikalu</a><a href="/studio/">3D profilu studija</a></nav></main></body>
</html>`;
}

async function loadProducts() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await readFile(path.join(storeSource, 'products.js'), 'utf8'), sandbox, { filename: 'products.js' });
  const baseCount = sandbox.window.PRODUCTS.length;
  vm.runInContext(await readFile(path.join(storeSource, 'imported-products.js'), 'utf8'), sandbox, { filename: 'imported-products.js' });
  return {
    products: sandbox.window.PRODUCTS,
    baseCount,
    storeConfig: sandbox.window.STORE_CONFIG
  };
}

async function writeText(relativePath, content) {
  const destination = path.join(distDir, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, 'utf8');
}

async function main() {
  const { products, baseCount } = await loadProducts();
  if (products.length !== 176 || products.filter(product => !isQuoted(product)).length !== 11) {
    throw new Error(`Unexpected catalog shape: ${products.length} total, ${products.filter(product => !isQuoted(product)).length} priced.`);
  }
  const routeSet = new Set(products.map(productRoute));
  if (routeSet.size !== products.length) throw new Error('Product route collision detected.');

  await rm(distDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  await mkdir(distDir, { recursive: true });

  await cp(path.join(storeSource, 'assets'), path.join(distDir, 'assets'), { recursive: true });
  await cp(path.join(repoRoot, 'assets'), path.join(distDir, 'studio', 'assets'), { recursive: true });
  await cp(path.join(storeSource, 'styles.css'), path.join(distDir, 'styles.css'));
  await cp(path.join(storeSource, 'products.js'), path.join(distDir, 'products.js'));
  await cp(path.join(storeSource, 'app.js'), path.join(distDir, 'app.js'));
  await cp(path.join(repoRoot, 'styles.css'), path.join(distDir, 'studio', 'styles.css'));
  await cp(path.join(repoRoot, 'app.js'), path.join(distDir, 'studio', 'app.js'));

  const importedPublic = products.slice(baseCount).map(({ sourceUrl: _sourceUrl, finishKey: _finishKey, ...product }) => product);
  await writeText('imported-products.js', `window.IMPORTED_PRODUCTS = ${JSON.stringify(importedPublic, null, 2)};\nwindow.PRODUCTS.push(...window.IMPORTED_PRODUCTS);\n`);

  const productsById = new Map(products.map(product => [product.id.toUpperCase(), product]));
  const [homeSource, productSource, successSource, studioSource] = await Promise.all([
    readFile(path.join(storeSource, 'index.html'), 'utf8'),
    readFile(path.join(storeSource, 'product.html'), 'utf8'),
    readFile(path.join(storeSource, 'success.html'), 'utf8'),
    readFile(path.join(repoRoot, 'index.html'), 'utf8')
  ]);

  await writeText('index.html', buildHome(homeSource, products, productsById));
  await writeText('success.html', buildSuccess(successSource));
  await writeText('studio/index.html', buildStudio(studioSource));

  for (const product of products) {
    const routePath = productRoute(product).replace(/^\//, '');
    await writeText(`${routePath}index.html`, buildProductPage(productSource, product, products, productsById));
  }

  await writeText('product.html', legacyProductRedirect(products, ''));
  await writeText('produkts/index.html', redirectDocument({ title: 'Produktu katalogs | 5 METRI', fallback: '../#produkti' }));
  await writeText('led-katalogs/index.html', redirectDocument({ title: 'Veikals ir pārvietots | 5 METRI', fallback: '../' }));
  await writeText('led-katalogs/product.html', legacyProductRedirect(products, '../'));
  await writeText('led-katalogs/success.html', redirectDocument({ title: 'Pasūtījums saņemts | 5 METRI', fallback: '../success.html' }));
  await writeText('404.html', buildNotFound());
  await writeText('robots.txt', buildRobots());
  await writeText('sitemap.xml', buildSitemap(products));
  await writeText('llms.txt', buildLlms(products));
  await writeText('llms-full.txt', buildLlms(products, true));
  await writeText('products.json', `${JSON.stringify({
    site: `${SITE_URL}/`,
    currency: 'EUR',
    vatRate: 0.21,
    productCount: products.length,
    pricedProductCount: products.filter(product => !isQuoted(product)).length,
    quoteProductCount: products.filter(isQuoted).length,
    products: products.map(publicProduct)
  }, null, 2)}\n`);
  await writeText('CNAME', '5metri.com\n');
  await writeText('.nojekyll', '');

  console.log(`Built ${products.length} product pages (${products.filter(product => !isQuoted(product)).length} indexed, ${products.filter(isQuoted).length} quote-only noindex).`);
  console.log(`Output: ${distDir}`);
}

await main();
