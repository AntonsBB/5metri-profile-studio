import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STORE_ID = '66733251';
const BASE_URL = 'https://5metri.lv/products';
const OUTPUT = path.resolve('led-katalogs/imported-products.js');
const REPORT = path.resolve('research/5metri-catalog-summary.json');

const roots = [
  { id: '122559509', key: 'aluminium', name: 'Alumīnija profili' },
  { id: '146821799', key: 'mini', name: 'Minilīstes profili' },
  { id: '122906502', key: 'pvc', name: 'PVC grīdas segums' },
  { id: '122906751', key: 'decorative', name: 'Smalkie profili dekoram' },
  { id: '122906501', key: 'floor', name: 'Grīdu profili' },
  { id: '122905754', key: 'tile', name: 'Flīžu profili' },
  { id: '122916002', key: 'skirting', name: 'Grīdas līstes' }
];

const decodeHtml = value => String(value || '')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&amp;', '&')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&nbsp;', ' ');

const plainText = value => decodeHtml(String(value || ''))
  .replace(/<br\s*\/?\s*>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function cleanDescription(value) {
  return plainText(value)
    .replace(/\*?\s*Cena norādīta[\s\S]*$/i, '')
    .replace(/The indicated price[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toDetails(description) {
  const parts = description
    .split(/(?<=[.!?])\s+|\s*[;•]\s*/)
    .map(item => item.trim())
    .filter(Boolean);
  return [...new Set(parts)].slice(0, 5);
}

function parseCards(html, type) {
  const className = type === 'category' ? 'grid-category__title' : 'grid-product__title';
  const idAttr = type === 'category' ? 'data-category-id' : 'data-product-id';
  const pattern = new RegExp(`<a\\s+href="([^"]+)"\\s+class="${className}"(?:\\s+title="([^"]*)")?[^>]*${idAttr}="(\\d+)"[^>]*>([\\s\\S]*?)<\\/a>`, 'gi');
  const items = [];
  for (const match of html.matchAll(pattern)) {
    const innerName = plainText(match[4]);
    items.push({
      id: match[3],
      href: match[1],
      name: decodeHtml(match[2] || innerName)
    });
  }
  return [...new Map(items.map(item => [item.id, item])).values()];
}

async function getJson(url) {
  const response = await fetch(url, { headers: { 'User-Agent': '5METRI-catalog-sync/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.json();
}

async function getCategory(id) {
  const url = `https://storefront.ecwid.com/category-page/${STORE_ID}/${id}/static-code?lang=lv&baseUrl=${encodeURIComponent(BASE_URL)}&cleanUrls=true&limit=100`;
  const data = await getJson(url);
  return {
    categories: parseCards(data.htmlCode, 'category'),
    products: parseCards(data.htmlCode, 'product')
  };
}

async function getProduct(id) {
  const url = `https://storefront.ecwid.com/product-page/${STORE_ID}/${id}/static-code?lang=lv&baseUrl=${encodeURIComponent(BASE_URL)}&cleanUrls=true`;
  const data = await getJson(url);
  const match = data.jsonLDHtml?.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error(`Missing product data for ${id}`);
  return JSON.parse(match[1]);
}

async function crawlRoot(root) {
  const queue = [{ id: root.id, name: root.name, path: [root.name] }];
  const seenCategories = new Set();
  const products = new Map();

  while (queue.length) {
    const current = queue.shift();
    if (seenCategories.has(current.id)) continue;
    seenCategories.add(current.id);
    const result = await getCategory(current.id);

    for (const category of result.categories) {
      queue.push({ id: category.id, name: category.name, path: [...current.path, category.name] });
    }
    for (const product of result.products) {
      if (!products.has(product.id)) products.set(product.id, { ...product, categoryPath: current.path });
    }
  }

  return [...products.values()];
}

const discovered = [];
for (const root of roots) {
  const products = await crawlRoot(root);
  for (const product of products) discovered.push({ ...product, root });
}

const unique = [...new Map(discovered.map(product => [product.id, product])).values()];
const imported = [];

for (let index = 0; index < unique.length; index += 1) {
  const found = unique[index];
  const data = await getProduct(found.id);
  const description = cleanDescription(data.description);
  const images = (Array.isArray(data.image) ? data.image : [data.image])
    .filter(Boolean)
    .map(image => image.contentUrl || image.url)
    .filter(url => /^https:\/\//.test(url));
  const url = data.offers?.url || `${BASE_URL}${found.href.startsWith('/') ? found.href : `/${found.href}`}`;
  imported.push({
    id: `FM-${found.id}`,
    slug: `fm-${found.id}`,
    category: found.root.key,
    name: data.name || found.name,
    finish: found.categoryPath.at(-1) || found.root.name,
    finishKey: 'catalog',
    dimensions: data.sku ? `Art. ${data.sku}` : found.root.name,
    price: null,
    availability: 'quote',
    images: images.length ? images : [],
    description: description || `${found.root.name} no 5 METRI sortimenta.`,
    details: toDetails(description),
    sourceUrl: url,
    sourceCategory: found.categoryPath.join(' / ')
  });
  if ((index + 1) % 10 === 0 || index + 1 === unique.length) {
    console.log(`Loaded ${index + 1}/${unique.length}`);
  }
}

imported.sort((a, b) => a.category.localeCompare(b.category, 'lv') || a.name.localeCompare(b.name, 'lv'));

await mkdir(path.dirname(OUTPUT), { recursive: true });
await mkdir(path.dirname(REPORT), { recursive: true });
await writeFile(
  OUTPUT,
  `window.IMPORTED_PRODUCTS = ${JSON.stringify(imported, null, 2)};\nwindow.PRODUCTS.push(...window.IMPORTED_PRODUCTS);\n`,
  'utf8'
);
await writeFile(
  REPORT,
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    storeId: STORE_ID,
    total: imported.length,
    imageCount: imported.reduce((sum, product) => sum + product.images.length, 0),
    counts: Object.fromEntries(roots.map(root => [root.key, imported.filter(product => product.category === root.key).length]))
  }, null, 2)}\n`,
  'utf8'
);

console.log(`Wrote ${imported.length} products to ${OUTPUT}`);
