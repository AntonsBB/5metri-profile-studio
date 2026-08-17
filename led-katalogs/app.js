const PRODUCTS = [
  { id: 'A10-N', category: 'shadow', name: 'Ēnu šuves profils 10 × 25', finish: 'Neapstrādāts', finishKey: 'raw', dimensions: '10 × 25 mm', price: 7.39, image: 'shadow-10x25-raw.jpg', description: 'Minimālistiska 10 mm ēnu šuve sienas un griestu savienojumam.' },
  { id: 'A10-B', category: 'shadow', name: 'Ēnu šuves profils 10 × 25', finish: 'Melns', finishKey: 'black', dimensions: '10 × 25 mm', price: 8.15, image: 'shadow-10x25-black.jpg', description: 'Melna apdare izteiksmīgai un precīzai ēnu līnijai gar sienu.' },
  { id: 'L16-N', category: 'led', name: 'LED ēnu šuves profils 16 × 22', finish: 'Neapstrādāts', finishKey: 'raw', dimensions: '16 × 22 mm', price: 9.17, image: 'led-16x22-raw.jpg', description: 'Kompakts profils ar vietu LED lentei un vienmērīgai malu gaismai.' },
  { id: 'L16-W', category: 'led', name: 'LED ēnu šuves profils 16 × 22', finish: 'Balts', finishKey: 'white', dimensions: '16 × 22 mm', price: 10.19, image: 'led-16x22-white.jpg', description: 'Balts griestu malas profils ar integrētu LED kanālu un difuzoru.' },
  { id: 'L16-B', category: 'led', name: 'LED ēnu šuves profils 16 × 22', finish: 'Melns', finishKey: 'black', dimensions: '16 × 22 mm', price: 10.19, image: 'led-16x22-black.jpg', description: 'Melns LED profils kontrastējošai gaismas līnijai modernā interjerā.' },
  { id: 'D23-W', category: 'led', name: 'LED distances profils 23 × 37', finish: 'Balts', finishKey: 'white', dimensions: '23 × 37 mm', price: 11.97, image: 'spacer-23x37-white.jpg', description: 'Netiešās gaismas profils peldoša ģipškartona griestu efekta izveidei.' },
  { id: 'D23-B', category: 'led', name: 'LED distances profils 23 × 37', finish: 'Melns', finishKey: 'black', dimensions: '23 × 37 mm', price: 11.97, image: 'spacer-23x37-black.jpg', description: 'Melns distances profils ar LED kanālu izteiksmīgam griestu perimetram.' },
  { id: 'D40-W', category: 'led', name: 'LED distances profils 40 × 50', finish: 'Balts', finishKey: 'white', dimensions: '40 × 50 mm', price: 15.02, image: 'spacer-40x50-white.jpg', description: 'Plats profils spēcīgākam peldošo griestu efektam un netiešai gaismai.' },
  { id: 'G20-W', category: 'shadow', name: 'Gala ēnu šuves profils 20 mm', finish: 'Balts', finishKey: 'white', dimensions: '20 mm šuve', price: 8.66, image: 'end-shadow-20-white.jpg', description: 'Griestu gala profils tīrai 20 mm šuvei un precīzai perimetra malai.' },
  { id: 'G20-B', category: 'shadow', name: 'Gala ēnu šuves profils 20 mm', finish: 'Melns', finishKey: 'black', dimensions: '20 mm šuve', price: 8.66, image: 'end-shadow-20-black.jpg', description: 'Melns gala profils kontrastējošai 20 mm ēnu šuvei pie sienas.' },
  { id: 'S15-W', category: 'separator', name: 'LED dalījuma profils', finish: 'Balts', finishKey: 'white', dimensions: '15 × 13,5 mm', price: 7.13, image: 'separator-led.jpg', description: 'Lineārs LED profils dekoratīvam dalījumam ģipškartona griestu plaknē.' }
];

const grid = document.querySelector('#catalogGrid');
const emptyState = document.querySelector('#emptyState');
const search = document.querySelector('#catalogSearch');
const filters = [...document.querySelectorAll('[data-filter]')];
const dialog = document.querySelector('#requestDialog');
const form = document.querySelector('#requestForm');
const formStatus = document.querySelector('#formStatus');
const submitButton = document.querySelector('#submitRequest');
const selectedBox = document.querySelector('#selectedProduct');
let activeFilter = 'all';
let selectedProduct = null;

const price = value => value.toLocaleString('lv-LV', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function productCard(product) {
  const categoryName = product.category === 'shadow' ? 'Ēnu šuve' : product.category === 'separator' ? 'Dalījums' : 'LED profils';
  return `
    <article class="product-card" data-category="${product.category}">
      <div class="product-image">
        <img src="assets/products/${product.image}" alt="${product.name}, ${product.finish.toLowerCase()}" loading="lazy">
        <div class="product-tags"><span>${categoryName}</span><i class="finish-dot ${product.finishKey}" title="${product.finish}"></i></div>
      </div>
      <div class="product-info">
        <div class="product-code"><span>${product.id}</span><span>${product.dimensions}</span></div>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <div class="product-bottom">
          <span class="product-price"><small>${product.finish} · bez PVN</small><b>${price(product.price)} € <span>/ m</span></b></span>
          <button class="product-request" type="button" data-product="${product.id}" aria-label="Pieprasīt cenu profilam ${product.name}">↗</button>
        </div>
      </div>
    </article>`;
}

function renderProducts() {
  const term = search.value.trim().toLocaleLowerCase('lv');
  const visible = PRODUCTS.filter(product => {
    const matchesCategory = activeFilter === 'all' || product.category === activeFilter;
    const haystack = `${product.name} ${product.finish} ${product.dimensions} ${product.id}`.toLocaleLowerCase('lv');
    return matchesCategory && haystack.includes(term);
  });
  grid.innerHTML = visible.map(productCard).join('');
  emptyState.hidden = visible.length !== 0;
}

function openRequest(productId = '') {
  selectedProduct = PRODUCTS.find(product => product.id === productId) || null;
  if (selectedProduct) {
    selectedBox.hidden = false;
    document.querySelector('#selectedProductImage').src = `assets/products/${selectedProduct.image}`;
    document.querySelector('#selectedProductImage').alt = selectedProduct.name;
    document.querySelector('#selectedProductName').textContent = `${selectedProduct.name} · ${selectedProduct.finish}`;
    document.querySelector('#selectedProductPrice').textContent = `${price(selectedProduct.price)} €/m bez PVN`;
    document.querySelector('#dialogTitle').textContent = 'Pieprasi šī profila cenu';
  } else {
    selectedBox.hidden = true;
    document.querySelector('#dialogTitle').textContent = 'Saņem projekta cenu';
  }
  formStatus.dataset.state = '';
  formStatus.textContent = 'Pieprasījums tiks nosūtīts tieši 5 METRI komandai.';
  dialog.showModal();
  document.body.classList.add('dialog-open');
}

function closeRequest() {
  dialog.close();
  document.body.classList.remove('dialog-open');
}

filters.forEach(button => button.addEventListener('click', () => {
  activeFilter = button.dataset.filter;
  filters.forEach(item => item.classList.toggle('active', item === button));
  renderProducts();
}));

search.addEventListener('input', renderProducts);
document.addEventListener('click', event => {
  const productButton = event.target.closest('[data-product]');
  if (productButton) openRequest(productButton.dataset.product);
  if (event.target.closest('[data-open-request]')) openRequest();
});
document.querySelector('#dialogClose').addEventListener('click', closeRequest);
dialog.addEventListener('click', event => {
  if (event.target === dialog) closeRequest();
});
dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  submitButton.disabled = true;
  submitButton.textContent = 'Nosūta…';
  formStatus.dataset.state = '';
  formStatus.textContent = 'Nosūta kontaktinformāciju un izvēlēto profilu…';

  const fields = Object.fromEntries(new FormData(form));
  const productText = selectedProduct
    ? `${selectedProduct.id} — ${selectedProduct.name}, ${selectedProduct.finish}, ${price(selectedProduct.price)} €/m bez PVN`
    : 'Vispārīgs LED / ēnu šuves profilu pieprasījums';
  const payload = {
    _subject: `LED profilu pieprasījums — ${fields.company}`,
    _template: 'table',
    _captcha: 'false',
    _url: location.href,
    produkts: productText,
    uznemums: fields.company,
    kontaktpersona: fields.name || 'nav norādīta',
    email: fields.email,
    talrunis: fields.phone || 'nav norādīts',
    daudzums_m: fields.quantity,
    velamais_garums: fields.length,
    piezime: fields.message || 'nav',
    message: `Jauns pieprasījums no LED profilu kataloga.\n\nProdukts: ${productText}\nUzņēmums: ${fields.company}\nKontaktpersona: ${fields.name || '-'}\nE-pasts: ${fields.email}\nTālrunis: ${fields.phone || '-'}\nDaudzums: ${fields.quantity} m\nGarums: ${fields.length}\nPiezīme: ${fields.message || '-'}`
  };

  try {
    const response = await fetch('https://formsubmit.co/ajax/abb@5metri.lv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.success === false || result.success === 'false') throw new Error(result.message || `HTTP ${response.status}`);
    formStatus.dataset.state = 'success';
    formStatus.textContent = 'Pieprasījums nosūtīts. 5 METRI komanda sazināsies ar jums.';
    submitButton.textContent = 'Nosūtīts ✓';
    form.reset();
    setTimeout(closeRequest, 2200);
  } catch (error) {
    console.error('Request delivery failed', error);
    formStatus.dataset.state = 'error';
    formStatus.textContent = 'Neizdevās nosūtīt. Lūdzu, mēģini vēlreiz vai raksti uz abb@5metri.lv.';
    submitButton.disabled = false;
    submitButton.textContent = 'Mēģināt vēlreiz →';
    return;
  }

  setTimeout(() => {
    submitButton.disabled = false;
    submitButton.textContent = 'Nosūtīt pieprasījumu →';
  }, 2800);
});

renderProducts();
