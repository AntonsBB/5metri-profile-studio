const CART_KEY = '5metri-led-cart-v2';
const money = new Intl.NumberFormat('lv-LV', { style: 'currency', currency: STORE_CONFIG.currency });
const productById = id => PRODUCTS.find(product => product.id === id);
const imagePath = (product, image = product.images[0]) => `assets/products/${product.slug}/${image}`;

let cart = loadCart();
let currentGalleryIndex = 0;
let currentProduct = null;

function loadCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(stored)
      ? stored.filter(item => productById(item.productId) && [2, 3].includes(Number(item.length)) && Number(item.quantity) > 0)
      : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
}

function categoryName(category) {
  if (category === 'shadow') return 'Ēnu šuve';
  if (category === 'separator') return 'Dalījuma profils';
  return 'LED profils';
}

function productCard(product) {
  return `
    <article class="product-card">
      <a class="product-card__image" href="product.html?id=${encodeURIComponent(product.id)}">
        <img src="${imagePath(product)}" alt="${product.name}, ${product.finish.toLowerCase()}" loading="lazy">
        <span class="product-card__badge">${categoryName(product.category)}</span>
        <span class="image-count" aria-label="${product.images.length} attēli">${product.images.length}</span>
      </a>
      <div class="product-card__body">
        <div class="product-card__meta"><span>${product.id}</span><span>${product.dimensions}</span></div>
        <h3><a href="product.html?id=${encodeURIComponent(product.id)}">${product.name}</a></h3>
        <p class="product-card__finish">${product.finish}</p>
        <div class="product-card__footer">
          <span class="product-card__price"><b>${money.format(product.price)}</b><small>par metru bez PVN</small></span>
          <a class="product-card__link" href="product.html?id=${encodeURIComponent(product.id)}">Apskatīt</a>
        </div>
      </div>
    </article>`;
}

function setupCatalog() {
  const grid = document.querySelector('#productGrid');
  if (!grid) return;
  const search = document.querySelector('#catalogSearch');
  const filters = [...document.querySelectorAll('[data-filter]')];
  const empty = document.querySelector('#emptyState');
  const count = document.querySelector('#resultCount');
  let activeFilter = 'all';

  function render() {
    const term = search.value.trim().toLocaleLowerCase('lv');
    const visible = PRODUCTS.filter(product => {
      const filterMatch = activeFilter === 'all' || product.category === activeFilter;
      const text = `${product.name} ${product.finish} ${product.dimensions} ${product.id}`.toLocaleLowerCase('lv');
      return filterMatch && text.includes(term);
    });
    grid.innerHTML = visible.map(productCard).join('');
    count.textContent = visible.length;
    empty.hidden = visible.length > 0;
  }

  filters.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.filter;
    filters.forEach(filter => filter.classList.toggle('active', filter === button));
    render();
  }));
  search.addEventListener('input', render);
  render();
}

function setupProductPage() {
  if (document.body.dataset.page !== 'product') return;
  const id = new URLSearchParams(location.search).get('id');
  currentProduct = productById(id) || PRODUCTS[0];
  const product = currentProduct;
  document.title = `${product.name} · ${product.finish} | 5 METRI`;
  document.querySelector('#breadcrumbName').textContent = product.name;
  document.querySelector('#productCode').textContent = product.id;
  document.querySelector('#productFinish').textContent = product.finish;
  document.querySelector('#productName').textContent = product.name;
  document.querySelector('#productDescription').textContent = product.description;
  document.querySelector('#productPrice').textContent = money.format(product.price);
  document.querySelector('#productGrossPrice').textContent = `${money.format(product.price * (1 + STORE_CONFIG.vatRate))} / m ar PVN`;
  document.querySelector('#price2m').textContent = `${money.format(product.price * 2 * (1 + STORE_CONFIG.vatRate))} ar PVN`;
  document.querySelector('#price3m').textContent = `${money.format(product.price * 3 * (1 + STORE_CONFIG.vatRate))} ar PVN`;

  const specs = [
    ['Produkta kods', product.id],
    ['Izmērs', product.dimensions],
    ['Apdare', product.finish],
    ['Materiāls', 'Alumīnijs'],
    ...product.details.map((detail, index) => [`${index + 1}. īpašība`, detail])
  ];
  document.querySelector('#productSpecs').innerHTML = specs.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');
  document.querySelector('#relatedGrid').innerHTML = PRODUCTS
    .filter(item => item.id !== product.id && item.category === product.category)
    .slice(0, 3)
    .map(productCard)
    .join('');

  const thumbs = document.querySelector('#galleryThumbs');
  thumbs.innerHTML = product.images.map((image, index) => `
    <button class="gallery-thumb${index === 0 ? ' active' : ''}" type="button" data-gallery-index="${index}" aria-label="Atvērt ${index + 1}. attēlu">
      <img src="${imagePath(product, image)}" alt="" loading="lazy">
    </button>`).join('');

  const showImage = index => {
    currentGalleryIndex = (index + product.images.length) % product.images.length;
    const main = document.querySelector('#productMainImage');
    main.src = imagePath(product, product.images[currentGalleryIndex]);
    main.alt = `${product.name}, ${product.finish.toLowerCase()} — ${currentGalleryIndex + 1}. attēls`;
    document.querySelector('#galleryCounter').textContent = `${currentGalleryIndex + 1} / ${product.images.length}`;
    document.querySelectorAll('[data-gallery-index]').forEach((button, buttonIndex) => button.classList.toggle('active', buttonIndex === currentGalleryIndex));
  };

  thumbs.addEventListener('click', event => {
    const button = event.target.closest('[data-gallery-index]');
    if (button) showImage(Number(button.dataset.galleryIndex));
  });
  document.querySelector('[data-gallery-prev]').addEventListener('click', () => showImage(currentGalleryIndex - 1));
  document.querySelector('[data-gallery-next]').addEventListener('click', () => showImage(currentGalleryIndex + 1));
  showImage(0);

  const form = document.querySelector('#purchaseForm');
  const quantity = document.querySelector('#quantity');
  const selectedLength = () => Number(form.elements.length.value);
  const safeQuantity = () => Math.min(100, Math.max(1, Number.parseInt(quantity.value, 10) || 1));
  const updateLineTotal = () => {
    quantity.value = safeQuantity();
    document.querySelector('#lineTotal').textContent = `${money.format(product.price * selectedLength() * safeQuantity() * (1 + STORE_CONFIG.vatRate))} ar PVN`;
  };
  form.addEventListener('change', updateLineTotal);
  quantity.addEventListener('input', updateLineTotal);
  document.querySelector('[data-qty-minus]').addEventListener('click', () => { quantity.value = Math.max(1, safeQuantity() - 1); updateLineTotal(); });
  document.querySelector('[data-qty-plus]').addEventListener('click', () => { quantity.value = Math.min(100, safeQuantity() + 1); updateLineTotal(); });
  form.addEventListener('submit', event => {
    event.preventDefault();
    addToCart(product.id, selectedLength(), safeQuantity());
    openCart();
  });
  document.querySelector('#buyNowButton').addEventListener('click', () => {
    addToCart(product.id, selectedLength(), safeQuantity());
    openCart();
  });
  updateLineTotal();
}

function addToCart(productId, length, quantity) {
  const existing = cart.find(item => item.productId === productId && Number(item.length) === Number(length));
  if (existing) existing.quantity = Math.min(100, Number(existing.quantity) + Number(quantity));
  else cart.push({ productId, length: Number(length), quantity: Math.min(100, Number(quantity)) });
  saveCart();
}

function renderCart() {
  const itemsBox = document.querySelector('#cartItems');
  if (!itemsBox) return;
  const count = cart.reduce((sum, item) => sum + Number(item.quantity), 0);
  document.querySelectorAll('[data-cart-count]').forEach(element => { element.textContent = count; });
  itemsBox.innerHTML = cart.map((item, index) => {
    const product = productById(item.productId);
    const net = product.price * Number(item.length) * Number(item.quantity);
    return `
      <article class="cart-item">
        <a href="product.html?id=${encodeURIComponent(product.id)}"><img src="${imagePath(product)}" alt="${product.name}"></a>
        <div class="cart-item__info">
          <b>${product.name}</b>
          <small>${product.finish} · ${item.length} m · ${item.quantity} gab.</small>
          <div class="cart-item__controls">
            <button type="button" data-cart-decrease="${index}">− 1</button>
            <button type="button" data-cart-increase="${index}">+ 1</button>
            <button type="button" data-cart-remove="${index}">Noņemt</button>
          </div>
        </div>
        <span class="cart-item__price"><b>${money.format(net * (1 + STORE_CONFIG.vatRate))}</b><small>ar PVN</small></span>
      </article>`;
  }).join('');

  const subtotal = cart.reduce((sum, item) => sum + productById(item.productId).price * Number(item.length) * Number(item.quantity), 0);
  const vat = subtotal * STORE_CONFIG.vatRate;
  document.querySelector('#cartEmpty').hidden = cart.length > 0;
  document.querySelector('#cartSummary').hidden = cart.length === 0;
  document.querySelector('#cartSubtotal').textContent = money.format(subtotal);
  document.querySelector('#cartVat').textContent = money.format(vat);
  document.querySelector('#cartTotal').textContent = money.format(subtotal + vat);
}

function openCart() {
  const drawer = document.querySelector('#cartDrawer');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('cart-open');
}

function closeCart() {
  const drawer = document.querySelector('#cartDrawer');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('cart-open');
}

async function checkout() {
  const button = document.querySelector('#checkoutButton');
  const status = document.querySelector('#checkoutStatus');
  if (!cart.length) return;
  if (!STORE_CONFIG.checkoutEndpoint) {
    status.textContent = 'Stripe apmaksa tiek aktivizēta. Grozs ir saglabāts šajā ierīcē.';
    return;
  }

  const fulfillment = document.querySelector('input[name="fulfillment"]:checked')?.value || 'pickup';
  button.disabled = true;
  button.textContent = 'Atver Stripe…';
  status.textContent = '';
  try {
    const response = await fetch(STORE_CONFIG.checkoutEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(item => ({ productId: item.productId, length: Number(item.length), quantity: Number(item.quantity) })),
        fulfillment,
        checkoutAttemptId: crypto.randomUUID()
      })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.url) throw new Error(result.error || 'Checkout unavailable');
    location.assign(result.url);
  } catch (error) {
    console.error('Checkout start failed', error);
    status.textContent = 'Neizdevās atvērt apmaksu. Lūdzu, mēģini vēlreiz.';
    button.disabled = false;
    button.textContent = 'Apmaksāt ar Stripe';
  }
}

document.addEventListener('click', event => {
  if (event.target.closest('[data-cart-open]')) openCart();
  if (event.target.closest('[data-cart-close]')) closeCart();

  const remove = event.target.closest('[data-cart-remove]');
  const decrease = event.target.closest('[data-cart-decrease]');
  const increase = event.target.closest('[data-cart-increase]');
  if (remove) { cart.splice(Number(remove.dataset.cartRemove), 1); saveCart(); }
  if (decrease) {
    const item = cart[Number(decrease.dataset.cartDecrease)];
    item.quantity = Number(item.quantity) - 1;
    if (item.quantity < 1) cart.splice(Number(decrease.dataset.cartDecrease), 1);
    saveCart();
  }
  if (increase) {
    const item = cart[Number(increase.dataset.cartIncrease)];
    item.quantity = Math.min(100, Number(item.quantity) + 1);
    saveCart();
  }
});

document.addEventListener('keydown', event => { if (event.key === 'Escape') closeCart(); });
document.querySelector('#checkoutButton')?.addEventListener('click', checkout);

setupCatalog();
setupProductPage();
renderCart();
