import { ProductResponse } from '../product/product';
import { SINGLE_VARIANT_NAME } from '../sale/sale-format';
import { formatClp } from '../shared/clp';
import { AdminProductResponse } from './admin-product';

// The backend's MenuRules, repeated so the form warns before sending. The backend has the last word: its
// messages are the same, so a 400 or 409 reads like these.

/** What fits a button of the 2-column Venta grid at "Muy grande". */
export const MAX_NAME_LENGTH = 40;

export const MIN_PROMO_QUANTITY = 2;

export const INVALID_PRICE_MESSAGE = 'Escribe solo números, sin decimales (ej. 3000 o 3.000).';

/** As the backend stores it: no spaces around, single spaces inside. */
export function normalizeName(raw: string): string {
  return raw.replace(/\s+/gu, ' ').trim();
}

/** "Gin + Bebida", "gin+bebida" and " GIN  +  Bebida " are the same name. */
export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

export function nameError(raw: string, of: 'producto' | 'variante'): string | null {
  const label = of === 'producto' ? 'El nombre del producto' : 'El nombre de la variante';
  const name = normalizeName(raw);
  if (!name) {
    return `${label} es obligatorio.`;
  }
  return name.length > MAX_NAME_LENGTH
    ? `${label} no puede superar los ${MAX_NAME_LENGTH} caracteres.`
    : null;
}

/** «Ya existe «Piscola» (desactivado).»: names never repeat, deactivated products included. */
export function takenProductError(
  raw: string,
  products: readonly AdminProductResponse[],
): string | null {
  const existing = products.find((product) => sameName(product.name, raw));
  if (!existing) {
    return null;
  }
  return `Ya existe «${existing.name}»${existing.active ? '.' : ' (desactivado).'}`;
}

export function takenVariantError(raw: string, product: AdminProductResponse): string | null {
  const existing = product.variants.find((variant) => sameName(variant.name, raw));
  if (!existing) {
    return null;
  }
  return `«${product.name}» ya tiene la variante «${existing.name}»${existing.active ? '.' : ' (desactivada).'}`;
}

/** Whole pesos as typed on the phone: "3000", "3.000" or "$3.000". Null when it is not one. */
export function parseClp(raw: string): number | null {
  const digits = raw.replace(/[$\s.]/gu, '');
  if (!/^\d+$/.test(digits)) {
    return null;
  }
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
}

export function priceError(raw: string): string | null {
  if (!raw.trim()) {
    return 'Escribe el precio.';
  }
  const price = parseClp(raw);
  if (price === null) {
    return INVALID_PRICE_MESSAGE;
  }
  return price > 0 ? null : 'El precio debe ser mayor que $0.';
}

/** The promo costs less than its glasses at the normal price (once that price is valid). */
export function promoPriceError(
  unitPrice: number | null,
  quantity: number,
  raw: string,
): string | null {
  if (!raw.trim()) {
    return 'Escribe el precio de la promo.';
  }
  const promoPrice = parseClp(raw);
  if (promoPrice === null) {
    return INVALID_PRICE_MESSAGE;
  }
  if (promoPrice <= 0) {
    return 'El precio de la promo debe ser mayor que $0.';
  }
  if (unitPrice !== null && unitPrice > 0 && promoPrice >= unitPrice * quantity) {
    return `La promo debe costar menos que ${quantity} vasos a precio normal (${formatClp(unitPrice * quantity)}).`;
  }
  return null;
}

/** What only the whole list can tell: a repeated name, or "Única" next to other variants. */
export function variantListError(raws: readonly string[]): string | null {
  const names = raws.map(normalizeName).filter((name) => name);
  const repeated = names.find((name, i) => names.findIndex((other) => sameName(other, name)) !== i);
  if (repeated) {
    return `La variante «${repeated}» está repetida.`;
  }
  if (names.length > 1 && names.some(isSingleVariant)) {
    return `«${SINGLE_VARIANT_NAME}» es solo para productos sin variantes: no se mezcla con otras.`;
  }
  return null;
}

export function isSingleVariant(name: string): boolean {
  return sameName(name, SINGLE_VARIANT_NAME);
}

/** Variants can be added only to an active product with real variants (DRAMA-28 renames "Única"). */
export function acceptsVariants(product: AdminProductResponse): boolean {
  return product.active && !product.variants.some((variant) => isSingleVariant(variant.name));
}

/** "3 × $12.000", or null without promo. */
export function promoLabel(product: {
  promoQuantity: number | null;
  promoPrice: number | null;
}): string | null {
  return product.promoQuantity !== null && product.promoPrice !== null
    ? `${product.promoQuantity} × ${formatClp(product.promoPrice)}`
    : null;
}

/** A product as the Venta grid would show it, for the preview before saving. */
export function previewProduct(product: {
  name: string;
  unitPrice: number;
  promoQuantity: number | null;
  promoPrice: number | null;
  variants: readonly string[];
}): ProductResponse {
  return {
    id: 0,
    name: product.name,
    unitPrice: product.unitPrice,
    promoQuantity: product.promoQuantity,
    promoPrice: product.promoPrice,
    variants: (product.variants.length > 0 ? product.variants : [SINGLE_VARIANT_NAME]).map(
      (name, i) => ({ id: -i - 1, name }),
    ),
  };
}

function nameKey(name: string): string {
  return name.replace(/\s+/gu, '').toLowerCase();
}
