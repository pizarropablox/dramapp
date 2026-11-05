import { ProductResponse } from '../product/product';
import { SINGLE_VARIANT_NAME } from '../sale/sale-format';
import { formatClp } from '../shared/clp';
import { AdminProductResponse, AdminVariantResponse } from './admin-product';

// The backend's MenuRules, repeated so the form warns before sending. The backend has the last word: its
// messages are the same, so a 400 or 409 reads like these.

/** What fits a button of the 2-column Venta grid at "Muy grande". */
export const MAX_NAME_LENGTH = 40;

export const MIN_PROMO_QUANTITY = 2;

export const INVALID_PRICE_MESSAGE = 'Escribe solo números, sin decimales (ej. 3000 o 3.000).';

/** "Revisar" with nothing edited. */
export const NO_CHANGES_MESSAGE = 'No cambiaste nada.';

/** Names are not stored with the sales, and «Para BARRA» finds its rows by name. */
export const RENAME_WARNING =
  'El nombre nuevo también se verá en ventas pasadas y eventos cerrados. Si tiene fila propia en «Para BARRA», sus ventas saldrán al final del Excel.';

/** The backend's 409: what runs out during the night is marked «Agotado» instead. */
export const EVENT_OPEN_MESSAGE = 'Hay un evento abierto. Si se acabó esta noche, márcalo agotado.';

export const DEACTIVATE_WARNING =
  'Sale de Venta y los botones siguientes se corren un lugar. Las ventas hechas, Totales y el Excel no cambian.';

/** A variant moves no button of the grid: it only leaves the picker. */
export function deactivateVariantWarning(productName: string): string {
  return `Sale del selector de variantes de «${productName}». Las ventas hechas, Totales y el Excel no cambian.`;
}

export const REACTIVATE_WARNING =
  'Vuelve a su lugar en Venta con este precio. Si cambió, edítalo después de reactivar.';

const SINGLE_VARIANT_MIXED_MESSAGE = `«${SINGLE_VARIANT_NAME}» es solo para productos sin variantes: no se mezcla con otras.`;

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

/**
 * «Ya existe «Piscola» (desactivado).»: names never repeat, deactivated products included. The product being
 * edited, if any, does not count.
 */
export function takenProductError(
  raw: string,
  products: readonly AdminProductResponse[],
  editedId?: number,
): string | null {
  const existing = products.find(
    (product) => product.id !== editedId && sameName(product.name, raw),
  );
  if (!existing) {
    return null;
  }
  return `Ya existe «${existing.name}»${existing.active ? '.' : ' (desactivado).'}`;
}

/** The variant being renamed, if any, does not count. */
export function takenVariantError(
  raw: string,
  product: AdminProductResponse,
  renamedId?: number,
): string | null {
  const existing = product.variants.find(
    (variant) => variant.id !== renamedId && sameName(variant.name, raw),
  );
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
    return SINGLE_VARIANT_MIXED_MESSAGE;
  }
  return null;
}

/** "Única" is for a variant with no others next to it, deactivated ones included. */
export function singleVariantError(raw: string, otherVariants: number): string | null {
  return isSingleVariant(raw) && otherVariants > 0 ? SINGLE_VARIANT_MIXED_MESSAGE : null;
}

export function isSingleVariant(name: string): boolean {
  return sameName(name, SINGLE_VARIANT_NAME);
}

/** A product without real variants: its first variant takes the place of "Única". */
export function hasOnlySingleVariant(product: AdminProductResponse): boolean {
  return product.variants.length === 1 && isSingleVariant(product.variants[0].name);
}

/** A product keeps a variant to sell: this one cannot be deactivated. */
export function isLastActiveVariant(
  product: AdminProductResponse,
  variant: AdminVariantResponse,
): boolean {
  return variant.active && product.variants.filter((other) => other.active).length === 1;
}

export function lastActiveVariantError(product: AdminProductResponse): string {
  return `Es la última variante activa de «${product.name}»: desactiva el producto.`;
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
