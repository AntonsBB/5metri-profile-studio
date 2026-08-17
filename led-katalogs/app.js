const CART_KEY = '5metri-led-cart-v2';
const RFQ_ENDPOINT = 'https://formsubmit.co/ajax/abb@5metri.lv';
const GITHUB_REPOSITORY_PATH = '/5metri-profile-studio/';
const SITE_BASE = location.hostname.toLowerCase() === 'antonsbb.github.io' ? GITHUB_REPOSITORY_PATH : '/';
const money = new Intl.NumberFormat('lv-LV', { style: 'currency', currency: STORE_CONFIG.currency });
const productById = id => PRODUCTS.find(product => product.id === id);
const isQuotedProduct = product => product?.availability === 'quote' || typeof product?.price !== 'number' || !Number.isFinite(product.price);

function sitePath(path = '') {
  const clean = String(path).replace(/^\/+/, '');
  return `${SITE_BASE}${clean}`.replace(/\/{2,}/g, '/');
}

function slugify(value) {
  return String(value ?? '')
    .replace(/&/g, ' un ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('lv')
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function productHref(product) {
  return sitePath(`produkts/${slugify(product.name)}-${slugify(product.id)}/`);
}

function imagePath(product, image = product.images[0]) {
  return /^https:\/\//i.test(image) ? image : sitePath(`assets/products/${product.slug}/${image}`);
}

function escapeHtml(value) {
  const characters = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
  return String(value ?? '').replace(/[&<>"']/g, character => characters[character]);
}

function normalizeSearch(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('lv');
}

function categoryName(category) {
  const names = { shadow: 'Ēnu šuvju profili', separator: 'Dalījuma profili', led: 'LED profili', aluminium: 'Alumīnija profili', mini: 'MINI profili', decorative: 'Dekoratīvie profili', floor: 'Grīdas profili', tile: 'Flīžu profili', skirting: 'Grīdlīstes', pvc: 'PVC profili' };
  return names[category] || 'Profili';
}

let cart = loadCart();
let currentGalleryIndex = 0;
let currentProduct = null;
let focusBeforeCart = null;

function loadCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter(item => {
      const product = productById(item.productId);
      return product && !isQuotedProduct(product) && [2, 3].includes(Number(item.length)) && Number(item.quantity) > 0;
    }) : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
}

function cartSubtotal() {
  return cart.reduce((sum, item) => {
    const product = productById(item.productId);
    return sum + product.price * Number(item.length) * Number(item.quantity);
  }, 0);
}

function productCard(product) {
  const href = productHref(product);
  const category = categoryName(product.category);
  const finish = product.finish || category;
  const categoryMeta = normalizeSearch(finish) === normalizeSearch(category) ? '' : `<span>${escapeHtml(category)}</span>`;
  const quoteOnly = isQuotedProduct(product);
  const price = quoteOnly
    ? '<span class="product-card__price product-card__price--quote"><b>Cena pēc pieprasījuma</b><small>Individuāls piedāvājums</small></span>'
    : `<span class="product-card__price"><b>${money.format(product.price)}</b><small>par metru bez PVN</small></span>`;
  return `<article class="product-card">
    <a class="product-card__image" href="${href}"><img src="${escapeHtml(imagePath(product))}" alt="${escapeHtml(`${product.name}, ${finish}`)}" width="500" height="500" loading="lazy"><span class="product-card__badge">${escapeHtml(category)}</span><span class="image-count" aria-label="${product.images.length} attēli">${product.images.length}</span></a>
    <div class="product-card__body"><div class="product-card__meta"><span>${escapeHtml(product.id)}</span><span>${escapeHtml(product.dimensions)}</span></div><h3><a href="${href}" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</a></h3><p class="product-card__finish"><span>${escapeHtml(finish)}</span>${categoryMeta}</p><div class="product-card__footer">${price}<a class="product-card__link" href="${href}">Apskatīt</a></div></div>
  </article>`;
}

function setupGlobalLinks() {
  document.querySelectorAll('[data-site-path]').forEach(link => { link.href = sitePath(link.dataset.sitePath || ''); });
}

function setupCatalog() {
  const grid = document.querySelector('#productGrid');
  if (!grid) return;
  const featured = document.querySelector('#featuredGrid');
  if (featured) featured.innerHTML = PRODUCTS.filter(product => !isQuotedProduct(product)).map(productCard).join('');

  const search = document.querySelector('#catalogSearch');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const empty = document.querySelector('#emptyState');
  const count = document.querySelector('#resultCount');
  const more = document.querySelector('#loadMoreButton');
  const initialQuery = new URLSearchParams(location.search).get('q') || '';
  search.value = initialQuery;
  let activeFilter = 'all';
  let limit = 24;
  let inputTimer;

  function filteredProducts() {
    const term = normalizeSearch(search.value.trim());
    return PRODUCTS.filter(product => {
      const filterMatch = activeFilter === 'all' || (activeFilter === 'signature' && ['shadow', 'led', 'separator'].includes(product.category)) || product.category === activeFilter;
      const text = normalizeSearch([product.name, product.finish, product.dimensions, product.id, product.description, product.sourceCategory, categoryName(product.category), ...(product.details || [])].join(' '));
      return filterMatch && text.includes(term);
    });
  }

  function render({ reset = false } = {}) {
    if (reset) limit = 24;
    const matches = filteredProducts();
    grid.innerHTML = matches.slice(0, limit).map(productCard).join('');
    count.textContent = matches.length;
    empty.hidden = matches.length > 0;
    more.hidden = matches.length <= limit;
    more.textContent = `Rādīt vēl profilus · ${Math.min(24, matches.length - limit)}`;
  }

  filters.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    filters.forEach(filter => { const active = filter === button; filter.classList.toggle('active', active); filter.setAttribute('aria-pressed', String(active)); });
    render({ reset: true });
  }));
  search.addEventListener('input', () => {
    clearTimeout(inputTimer);
    inputTimer = setTimeout(() => {
      const url = new URL(location.href);
      if (search.value.trim()) url.searchParams.set('q', search.value.trim()); else url.searchParams.delete('q');
      history.replaceState(null, '', `${url.pathname}${url.search}${location.hash}`);
      render({ reset: true });
    }, 140);
  });
  more.addEventListener('click', () => { limit += 24; render(); });
  render();
}

function detailFact(detail, index) {
  const separator = String(detail).indexOf(':');
  if (separator > 1 && separator < 34) return [String(detail).slice(0, separator).trim(), String(detail).slice(separator + 1).trim()];
  return [index === 0 ? 'Materiāls un pielietojums' : 'Papildu informācija', detail];
}

function renderInvalidProduct() {
  document.title = 'Profils nav atrasts | 5 METRI';
  document.querySelector('meta[name="robots"]')?.setAttribute('content', 'noindex,nofollow');
  document.querySelector('#productPage').innerHTML = `<section class="not-found"><p class="kicker">404</p><h1>Profils nav atrasts.</h1><p>Iespējams, saite ir mainījusies vai produktam vairs nav publiskas lapas.</p><a class="button button-dark" href="${sitePath('')}">Atgriezties katalogā</a></section>`;
}

function setupProductPage() {
  if (document.body.dataset.page !== 'product') return;
  const queryId = new URLSearchParams(location.search).get('id');
  const id = document.body.dataset.productId || queryId;
  currentProduct = productById(id);
  if (!currentProduct) { renderInvalidProduct(); return; }
  const product = currentProduct;

  const isStaticProductPage = Boolean(document.body.dataset.productId);
  if (!isStaticProductPage) {
    document.title = `${product.name} · ${product.finish} | 5 METRI`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', product.description);
  }
  document.querySelector('#breadcrumbCategory').textContent = categoryName(product.category);
  document.querySelector('#breadcrumbName').textContent = product.name;
  document.querySelector('#productCode').textContent = product.id;
  document.querySelector('#productFinish').textContent = product.finish;
  document.querySelector('#productName').textContent = product.name;
  document.querySelector('#productDescription').textContent = product.description;

  const facts = [['Produkta kods', product.id], ['Izmērs / artikuls', product.dimensions], ['Kategorija', categoryName(product.category)], ['Kolekcija / apdare', product.finish], ...(product.details || []).map(detailFact)];
  document.querySelector('#productSpecs').innerHTML = facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('');
  document.querySelector('#relatedGrid').innerHTML = PRODUCTS.filter(item => item.id !== product.id && item.category === product.category).slice(0, 4).map(productCard).join('');

  const thumbs = document.querySelector('#galleryThumbs');
  thumbs.innerHTML = product.images.map((image, index) => `<button class="gallery-thumb${index === 0 ? ' active' : ''}" type="button" data-gallery-index="${index}" aria-label="Atvērt ${index + 1}. attēlu"><img src="${escapeHtml(imagePath(product, image))}" alt="" width="120" height="120" loading="lazy"></button>`).join('');
  const showImage = index => {
    currentGalleryIndex = (index + product.images.length) % product.images.length;
    const main = document.querySelector('#productMainImage');
    main.src = imagePath(product, product.images[currentGalleryIndex]);
    main.alt = `${product.name}, ${product.finish.toLowerCase()} — ${currentGalleryIndex + 1}. attēls`;
    main.width = 900; main.height = 760;
    document.querySelector('#galleryCounter').textContent = `${currentGalleryIndex + 1} / ${product.images.length}`;
    document.querySelectorAll('[data-gallery-index]').forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === currentGalleryIndex));
  };
  thumbs.addEventListener('click', event => { const button = event.target.closest('[data-gallery-index]'); if (button) showImage(Number(button.dataset.galleryIndex)); });
  document.querySelector('[data-gallery-prev]').addEventListener('click', () => showImage(currentGalleryIndex - 1));
  document.querySelector('[data-gallery-next]').addEventListener('click', () => showImage(currentGalleryIndex + 1));
  showImage(0);

  const form = document.querySelector('#purchaseForm');
  const quotePanel = document.querySelector('#quotePanel');
  const detailPrice = document.querySelector('#detailPrice');
  const mobileLabel = document.querySelector('#mobileActionLabel');
  const mobilePrice = document.querySelector('#mobileActionPrice');
  const mobileButton = document.querySelector('#mobileActionButton');
  if (isQuotedProduct(product)) {
    detailPrice.hidden = true; form.hidden = true; quotePanel.hidden = false;
    const subject = `Cenas pieprasījums: ${product.name}`;
    const body = `Labdien!\n\nVēlos saņemt cenas piedāvājumu produktam “${product.name}” (${product.id}).\n\nNepieciešamais izmērs / daudzums:\n`;
    document.querySelector('#quoteLink').href = `mailto:helena@5metri.lv?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setupQuoteForm(product);
    mobileLabel.textContent = product.id;
    mobilePrice.textContent = 'Cena pēc pieprasījuma';
    mobileButton.textContent = 'Pieprasīt cenu';
    mobileButton.addEventListener('click', () => { quotePanel.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => document.querySelector('#quoteForm input')?.focus(), 400); });
  } else {
    detailPrice.hidden = false; form.hidden = false; quotePanel.hidden = true;
    document.querySelector('#productPrice').textContent = money.format(product.price);
    document.querySelector('#productGrossPrice').textContent = `${money.format(product.price * (1 + STORE_CONFIG.vatRate))} / m ar PVN`;
    document.querySelector('#price2m').textContent = `${money.format(product.price * 2 * (1 + STORE_CONFIG.vatRate))} ar PVN`;
    document.querySelector('#price3m').textContent = `${money.format(product.price * 3 * (1 + STORE_CONFIG.vatRate))} ar PVN`;
    setupPurchaseForm(product, form);
    mobilePrice.textContent = `no ${money.format(product.price * 2 * (1 + STORE_CONFIG.vatRate))}`;
    mobileButton.textContent = 'Izvēlēties garumu';
    mobileButton.addEventListener('click', () => form.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }
}

function setupQuoteForm(product) {
  const form = document.querySelector('#quoteForm');
  const status = document.querySelector('#quoteStatus');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    const original = button.textContent;
    button.disabled = true; button.textContent = 'Nosūta…'; status.dataset.state = 'sending'; status.textContent = 'Nosūta pieprasījumu 5 METRI komandai…';
    const payload = { _subject: `Cenas pieprasījums: ${product.name} (${product.id})`, _template: 'table', _captcha: 'false', _url: location.href, produkts: product.name, produkta_kods: product.id, kategorija: categoryName(product.category), izmers: product.dimensions, apdare: product.finish, vards_uznemums: data.get('name'), email: data.get('email'), talrunis: data.get('phone'), daudzums_garums: data.get('quantity'), piezime: data.get('details') || 'nav' };
    try {
      const response = await fetch(RFQ_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false || result.success === 'false') throw new Error(result.message || `HTTP ${response.status}`);
      status.dataset.state = 'success'; status.textContent = 'Pieprasījums nosūtīts. Sazināsimies ar tevi par cenu un pieejamību.';
      button.textContent = 'Nosūtīts ✓'; form.reset();
    } catch (error) {
      console.error('Quote delivery failed', error);
      status.dataset.state = 'error'; status.textContent = 'Neizdevās apstiprināt nosūtīšanu. Mēģini vēlreiz vai izmanto e-pasta saiti.';
      button.disabled = false; button.textContent = original;
    }
  });
}

function setupPurchaseForm(product, form) {
  const quantity = document.querySelector('#quantity');
  const selectedLength = () => Number(form.elements.namedItem('length').value);
  const safeQuantity = () => Math.min(100, Math.max(1, Number.parseInt(quantity.value, 10) || 1));
  const updateLineTotal = () => { quantity.value = safeQuantity(); document.querySelector('#lineTotal').textContent = `${money.format(product.price * selectedLength() * safeQuantity() * (1 + STORE_CONFIG.vatRate))} ar PVN`; };
  form.addEventListener('change', updateLineTotal); quantity.addEventListener('input', updateLineTotal);
  document.querySelector('[data-qty-minus]').addEventListener('click', () => { quantity.value = Math.max(1, safeQuantity() - 1); updateLineTotal(); });
  document.querySelector('[data-qty-plus]').addEventListener('click', () => { quantity.value = Math.min(100, safeQuantity() + 1); updateLineTotal(); });
  form.addEventListener('submit', event => { event.preventDefault(); addToCart(product.id, selectedLength(), safeQuantity()); openCart(); });
  document.querySelector('#buyNowButton').addEventListener('click', () => { addToCart(product.id, selectedLength(), safeQuantity()); openCart(); });
  updateLineTotal();
}

function addToCart(productId, length, quantity) {
  const product = productById(productId);
  if (!product || isQuotedProduct(product)) return;
  const existing = cart.find(item => item.productId === productId && Number(item.length) === Number(length));
  if (existing) existing.quantity = Math.min(100, Number(existing.quantity) + Number(quantity)); else cart.push({ productId, length: Number(length), quantity: Math.min(100, Number(quantity)) });
  saveCart();
}

function renderCart() {
  const itemsBox = document.querySelector('#cartItems');
  if (!itemsBox) return;
  const itemCount = cart.reduce((sum, item) => sum + Number(item.quantity), 0);
  document.querySelectorAll('[data-cart-count]').forEach(element => { element.textContent = itemCount; });
  itemsBox.innerHTML = cart.map((item, index) => {
    const product = productById(item.productId);
    const net = product.price * Number(item.length) * Number(item.quantity);
    return `<article class="cart-item"><a href="${productHref(product)}"><img src="${imagePath(product)}" alt="${escapeHtml(product.name)}" width="76" height="76"></a><div class="cart-item__info"><b>${escapeHtml(product.name)}</b><small>${escapeHtml(product.finish)} · ${item.length} m · ${item.quantity} gab.</small><div class="cart-item__controls"><button type="button" data-cart-decrease="${index}">− 1</button><button type="button" data-cart-increase="${index}">+ 1</button><button type="button" data-cart-remove="${index}">Noņemt</button></div></div><span class="cart-item__price"><b>${money.format(net * (1 + STORE_CONFIG.vatRate))}</b><small>ar PVN</small></span></article>`;
  }).join('');
  const subtotal = cartSubtotal(); const vat = subtotal * STORE_CONFIG.vatRate;
  document.querySelector('#cartEmpty').hidden = cart.length > 0; document.querySelector('#cartSummary').hidden = cart.length === 0;
  document.querySelector('#cartSubtotal').textContent = money.format(subtotal); document.querySelector('#cartVat').textContent = money.format(vat); document.querySelector('#cartTotal').textContent = money.format(subtotal + vat);
}

function openCart() {
  const drawer = document.querySelector('#cartDrawer');
  focusBeforeCart = document.activeElement;
  drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); document.body.classList.add('cart-open');
  requestAnimationFrame(() => drawer.querySelector('.cart-panel')?.focus());
}

function closeCart() {
  const drawer = document.querySelector('#cartDrawer');
  if (!drawer?.classList.contains('open')) return;
  drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); document.body.classList.remove('cart-open');
  if (focusBeforeCart instanceof HTMLElement) focusBeforeCart.focus();
}

function trapCartFocus(event) {
  const drawer = document.querySelector('#cartDrawer');
  if (event.key !== 'Tab' || !drawer?.classList.contains('open')) return;
  const focusable = [...drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')].filter(element => !element.hidden && element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0]; const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
}

async function checkout() {
  const button = document.querySelector('#checkoutButton'); const status = document.querySelector('#checkoutStatus');
  cart = cart.filter(item => { const product = productById(item.productId); return product && !isQuotedProduct(product); });
  if (!cart.length) { saveCart(); return; }
  const fulfillment = document.querySelector('input[name="fulfillment"]:checked')?.value || 'pickup';
  button.disabled = true; button.textContent = 'Atver Stripe…'; status.textContent = '';
  try {
    const response = await fetch(STORE_CONFIG.checkoutEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: cart.map(item => ({ productId: item.productId, length: Number(item.length), quantity: Number(item.quantity) })), fulfillment, checkoutAttemptId: crypto.randomUUID() }) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) throw new Error(result.error || 'Checkout unavailable');
    location.assign(result.url);
  } catch (error) {
    console.error('Checkout start failed', error); status.textContent = 'Neizdevās atvērt apmaksu. Lūdzu, mēģini vēlreiz.'; button.disabled = false; button.textContent = 'Apmaksāt ar Stripe';
  }
}

function setupReveals() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
  const targets = document.querySelectorAll('.paths, .ready-section, .studio-feature, .catalog, .service-strip, .faq, .product-specs, .custom-profile-cta');
  targets.forEach(target => target.classList.add('reveal-ready'));
  const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target); } }), { rootMargin: '0px 0px -10% 0px', threshold: .08 });
  targets.forEach(target => observer.observe(target));
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-cart-open]')) openCart();
  if (event.target.closest('[data-cart-close]')) closeCart();
  const remove = event.target.closest('[data-cart-remove]'); const decrease = event.target.closest('[data-cart-decrease]'); const increase = event.target.closest('[data-cart-increase]');
  if (remove) { cart.splice(Number(remove.dataset.cartRemove), 1); saveCart(); }
  if (decrease) { const index = Number(decrease.dataset.cartDecrease); cart[index].quantity = Number(cart[index].quantity) - 1; if (cart[index].quantity < 1) cart.splice(index, 1); saveCart(); }
  if (increase) { const item = cart[Number(increase.dataset.cartIncrease)]; item.quantity = Math.min(100, Number(item.quantity) + 1); saveCart(); }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCart(); trapCartFocus(event); });
document.querySelector('#checkoutButton')?.addEventListener('click', checkout);

setupGlobalLinks(); setupCatalog(); setupProductPage(); renderCart(); setupReveals();
