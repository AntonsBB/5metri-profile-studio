const STRIPE_API_VERSION = '2026-07-29.dahlia';
const INTEGRATION_IDENTIFIER = '5metri_web_uslohdrp';
const PHYSICAL_GOODS_TAX_CODE = 'txcd_99999999';
const MAX_BODY_BYTES = 8_192;
const MAX_LINE_ITEMS = 20;
const MAX_QUANTITY = 100;

const CATALOG = Object.freeze({
  'A10-N': { name: 'Ēnu šuves profils 10 × 25 mm', finish: 'Neapstrādāts alumīnijs', centsPerMeter: 739 },
  'A10-B': { name: 'Ēnu šuves profils 10 × 25 mm', finish: 'Melns, RAL 9005', centsPerMeter: 815 },
  'L16-N': { name: 'LED ēnu šuves profils 16 × 22 mm', finish: 'Neapstrādāts alumīnijs', centsPerMeter: 917 },
  'L16-W': { name: 'LED ēnu šuves profils 16 × 22 mm', finish: 'Balts, RAL 9016', centsPerMeter: 1019 },
  'L16-B': { name: 'LED ēnu šuves profils 16 × 22 mm', finish: 'Melns, RAL 9005', centsPerMeter: 1019 },
  'D23-W': { name: 'LED distances profils 23 × 37 mm', finish: 'Balts, RAL 9016', centsPerMeter: 1197 },
  'D23-B': { name: 'LED distances profils 23 × 37 mm', finish: 'Melns, RAL 9005', centsPerMeter: 1197 },
  'D40-W': { name: 'LED distances profils 40 × 50 mm', finish: 'Balts, RAL 9016', centsPerMeter: 1502 },
  'G20-W': { name: 'Gala ēnu profils ar LED kanālu', finish: 'Balts, RAL 9016', centsPerMeter: 866 },
  'G20-B': { name: 'Gala ēnu profils ar LED kanālu', finish: 'Melns, RAL 9005', centsPerMeter: 866 },
  'S15-W': { name: 'LED dalījuma profils 15 mm', finish: 'Balts', centsPerMeter: 713 }
});

function json(data, status, origin) {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin'
  });
  if (origin) headers.set('Access-Control-Allow-Origin', origin);
  return Response.json(data, { status, headers });
}

function preflight(origin) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    }
  });
}

function validateCart(body) {
  if (!body || typeof body !== 'object' || !Array.isArray(body.items)) return null;
  if (body.items.length < 1 || body.items.length > MAX_LINE_ITEMS) return null;
  if (!['pickup', 'delivery'].includes(body.fulfillment)) return null;
  if (typeof body.checkoutAttemptId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.checkoutAttemptId)) return null;

  const items = [];
  for (const item of body.items) {
    const product = item && CATALOG[item.productId];
    const length = Number(item?.length);
    const quantity = Number(item?.quantity);
    if (!product || ![2, 3].includes(length) || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return null;
    items.push({ productId: item.productId, product, length, quantity });
  }
  return { items, fulfillment: body.fulfillment, checkoutAttemptId: body.checkoutAttemptId };
}

async function readJsonBody(request) {
  const statedLength = Number(request.headers.get('Content-Length') || 0);
  if (statedLength > MAX_BODY_BYTES) throw new RangeError('Request too large');
  if (!request.body) return null;

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError('Request too large');
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function buildStripeParams(cart) {
  const params = new URLSearchParams({
    mode: 'payment',
    success_url: `${env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.STORE_URL,
    customer_creation: 'always',
    billing_address_collection: 'required',
    'automatic_tax[enabled]': 'true',
    'phone_number_collection[enabled]': 'true',
    'tax_id_collection[enabled]': 'true',
    'invoice_creation[enabled]': 'true',
    'metadata[fulfillment]': cart.fulfillment,
    'payment_intent_data[metadata][fulfillment]': cart.fulfillment,
    integration_identifier: INTEGRATION_IDENTIFIER
  });

  if (cart.fulfillment === 'delivery') {
    params.set('shipping_address_collection[allowed_countries][0]', 'LV');
  }

  cart.items.forEach((item, index) => {
    const prefix = `line_items[${index}]`;
    params.set(`${prefix}[quantity]`, String(item.quantity));
    params.set(`${prefix}[price_data][currency]`, 'eur');
    params.set(`${prefix}[price_data][unit_amount]`, String(item.product.centsPerMeter * item.length));
    params.set(`${prefix}[price_data][tax_behavior]`, 'exclusive');
    params.set(`${prefix}[price_data][product_data][name]`, `${item.product.name} · ${item.length} m`);
    params.set(`${prefix}[price_data][product_data][description]`, item.product.finish);
    params.set(`${prefix}[price_data][product_data][tax_code]`, PHYSICAL_GOODS_TAX_CODE);
    params.set(`${prefix}[price_data][product_data][metadata][product_id]`, item.productId);
    params.set(`${prefix}[price_data][product_data][metadata][length_m]`, String(item.length));
  });

  return params;
}

async function createCheckoutSession(cart, env) {
  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': STRIPE_API_VERSION,
      'Idempotency-Key': `5metri-checkout-${cart.checkoutAttemptId}`
    },
    body: buildStripeParams(cart)
  });
  const result = await response.json();
  if (!response.ok || typeof result.url !== 'string') {
    console.error(JSON.stringify({
      message: 'Stripe Checkout Session creation failed',
      status: response.status,
      requestId: response.headers.get('request-id'),
      stripeCode: result?.error?.code || 'unknown'
    }));
    throw new Error('Stripe Checkout Session creation failed');
  }
  return result.url;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const allowedOrigins = new Set(env.ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean));
    const allowedOrigin = allowedOrigins.has(origin) ? origin : '';

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true }, 200, allowedOrigin);
    }
    if (!allowedOrigin) return json({ error: 'Origin not allowed' }, 403, '');
    if (request.method === 'OPTIONS') return preflight(allowedOrigin);
    if (url.pathname !== '/checkout' || request.method !== 'POST') return json({ error: 'Not found' }, 404, allowedOrigin);
    if (!env.STRIPE_SECRET_KEY) return json({ error: 'Checkout is not configured' }, 503, allowedOrigin);
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
      return json({ error: 'Content type must be application/json' }, 415, allowedOrigin);
    }

    try {
      const body = await readJsonBody(request);
      const cart = validateCart(body);
      if (!cart) return json({ error: 'Invalid cart' }, 400, allowedOrigin);
      const checkoutUrl = await createCheckoutSession(cart, env);
      return json({ url: checkoutUrl }, 200, allowedOrigin);
    } catch (error) {
      if (error instanceof RangeError) return json({ error: 'Request too large' }, 413, allowedOrigin);
      if (error instanceof SyntaxError) return json({ error: 'Invalid JSON' }, 400, allowedOrigin);
      console.error(JSON.stringify({
        message: 'Checkout request failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        path: url.pathname
      }));
      return json({ error: 'Unable to start checkout' }, 502, allowedOrigin);
    }
  }
};
