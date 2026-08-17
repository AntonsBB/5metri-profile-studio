import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { productRoute } from './store-routes.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(repoRoot, 'dist');
const sourceDir = path.join(repoRoot, 'led-katalogs');
const SITE_URL = String(process.env.SITE_URL || 'https://5metri.com').replace(/\/$/, '');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isQuoted(product) {
  return product?.availability === 'quote' || !Number.isFinite(product?.price);
}

async function loadSourceProducts() {
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(await readFile(path.join(sourceDir, 'products.js'), 'utf8'), sandbox);
  vm.runInContext(await readFile(path.join(sourceDir, 'imported-products.js'), 'utf8'), sandbox);
  return sandbox.window.PRODUCTS;
}

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => JSON.parse(match[1]));
}

const requiredFiles = [
  'index.html', 'styles.css', 'app.js', 'products.js', 'imported-products.js',
  'success.html', '404.html', 'robots.txt', 'sitemap.xml', 'llms.txt',
  'llms-full.txt', 'products.json', 'CNAME', '.nojekyll', 'studio/index.html',
  'studio/styles.css', 'studio/app.js', 'led-katalogs/index.html',
  'led-katalogs/product.html', 'led-katalogs/success.html'
];
await Promise.all(requiredFiles.map(file => access(path.join(distDir, file))));

const products = await loadSourceProducts();
assert(products.length === 176, `Expected 176 source products, received ${products.length}.`);
assert(products.filter(product => !isQuoted(product)).length === 11, 'Expected 11 priced products.');
assert(new Set(products.map(productRoute)).size === products.length, 'Product route collision found.');

for (const product of products) {
  const route = productRoute(product);
  const file = path.join(distDir, route.replace(/^\//, ''), 'index.html');
  const html = await readFile(file, 'utf8');
  assert(html.includes(`data-product-id="${product.id}"`), `${product.id}: missing body product ID.`);
  assert(html.includes('<base href="../../">'), `${product.id}: transition-safe base path missing.`);
  const basePosition = html.indexOf('<base href="../../">');
  const stylesheetPosition = html.indexOf('<link rel="stylesheet"');
  assert(basePosition > html.indexOf('<head') && stylesheetPosition > basePosition, `${product.id}: base must precede stylesheet URLs.`);
  const assetReferences = [
    ...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi),
    ...html.matchAll(/<script\b[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi)
  ].map(match => match[1]).filter(reference => !/^https?:\/\//i.test(reference));
  for (const reference of assetReferences) {
    const assetPath = reference.split(/[?#]/, 1)[0];
    const resolved = path.resolve(path.dirname(file), '../../', assetPath);
    await access(resolved);
    assert(resolved.startsWith(distDir), `${product.id}: asset resolved outside dist: ${reference}`);
  }
  assert(html.includes(`<h1 id="productName">${product.name.replace(/&/g, '&amp;')}`), `${product.id}: missing server-rendered H1.`);
  assert(jsonLdBlocks(html).length === 1, `${product.id}: expected one JSON-LD block.`);
  if (isQuoted(product)) {
    assert(html.includes('<meta name="robots" content="noindex,follow">'), `${product.id}: quote page must be noindex,follow.`);
    assert(html.includes(`<link rel="canonical" href="${product.sourceUrl}`), `${product.id}: quote page source canonical missing.`);
  } else {
    assert(html.includes('<meta name="robots" content="index,follow,max-image-preview:large">'), `${product.id}: priced page must be indexable.`);
    assert(html.includes(`<link rel="canonical" href="${SITE_URL}${route}">`), `${product.id}: priced canonical mismatch.`);
  }
}

const home = await readFile(path.join(distDir, 'index.html'), 'utf8');
assert(home.includes(`<link rel="canonical" href="${SITE_URL}/">`), 'Home canonical mismatch.');
assert(home.includes('id="featuredGrid"'), 'Featured grid missing.');
assert((home.match(/class="product-card"/g) || []).length === 35, 'Home must SSR 11 featured plus 24 catalog cards.');
assert(home.includes('id="staticProductIndex"'), 'Crawlable alphabetical product index missing.');
assert(jsonLdBlocks(home).length === 1, 'Home must contain exactly one JSON-LD block.');
for (const product of products) {
  assert(home.includes(`href="${productRoute(product).replace(/^\//, '')}"`), `${product.id}: clean product link missing from home.`);
}

const publicCatalogText = await readFile(path.join(distDir, 'products.json'), 'utf8');
const publicCatalog = JSON.parse(publicCatalogText);
assert(publicCatalog.products.length === products.length, 'Public catalog product count mismatch.');
for (const forbidden of ['sourceUrl', 'sourceCategory', 'finishKey']) {
  assert(!publicCatalogText.includes(`"${forbidden}"`), `Public catalog leaks ${forbidden}.`);
}
const builtImported = await readFile(path.join(distDir, 'imported-products.js'), 'utf8');
assert(!builtImported.includes('sourceUrl'), 'Production imported bundle leaks sourceUrl.');

const sitemap = await readFile(path.join(distDir, 'sitemap.xml'), 'utf8');
const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert(sitemapLocations.length === 2 + products.filter(product => !isQuoted(product)).length, 'Sitemap URL count mismatch.');
for (const product of products.filter(isQuoted)) {
  assert(!sitemapLocations.includes(`${SITE_URL}${productRoute(product)}`), `${product.id}: noindex quote route leaked into sitemap.`);
}

const success = await readFile(path.join(distDir, 'success.html'), 'utf8');
const notFound = await readFile(path.join(distDir, '404.html'), 'utf8');
const studio = await readFile(path.join(distDir, 'studio', 'index.html'), 'utf8');
assert(success.includes('noindex,nofollow,noarchive'), 'Success page noindex missing.');
assert(notFound.includes('noindex,follow'), '404 noindex missing.');
assert(!studio.includes('data-legacy-href="./led-katalogs/"'), 'Studio retains a broken legacy store path.');
assert(studio.includes('data-legacy-href="../"'), 'Studio transition-safe store path missing.');

console.log(`Validated ${products.length} static product pages and ${sitemapLocations.length} sitemap URLs.`);
