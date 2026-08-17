export function toSeoSlug(value) {
  return String(value ?? '')
    .replace(/×/g, ' x ')
    .replace(/&/g, ' un ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 72) || 'profils';
}

export function normalizedProductId(value) {
  return toSeoSlug(value);
}

export function productRoute(product) {
  return `/produkts/${toSeoSlug(product.name)}-${normalizedProductId(product.id)}/`;
}
