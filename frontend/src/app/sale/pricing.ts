/**
 * Display-only price calculation. Mirrors the backend's PriceCalculator,
 * which remains the authority: the sale total shown after confirming comes from the backend.
 *
 * Promos apply automatically per product, adding up the units of all its variants;
 * they never mix different products.
 */

export interface ProductPrice {
  productId: number;
  unitPrice: number;
  promoQuantity: number | null;
  promoPrice: number | null;
}

export interface PricedLine extends ProductPrice {
  quantity: number;
}

export interface SaleTotals {
  /** What the customer pays, promos applied. */
  subtotal: number;
  /** What the same units would cost without promos. */
  regularTotal: number;
  /** regularTotal - subtotal. */
  savings: number;
}

export function productSubtotal(price: ProductPrice, units: number): number {
  if (price.promoQuantity === null || price.promoPrice === null) {
    return units * price.unitPrice;
  }
  const promos = Math.floor(units / price.promoQuantity);
  const singles = units % price.promoQuantity;
  return promos * price.promoPrice + singles * price.unitPrice;
}

export function calculateTotals(lines: readonly PricedLine[]): SaleTotals {
  const byProduct = new Map<number, { price: ProductPrice; units: number }>();
  for (const line of lines) {
    const entry = byProduct.get(line.productId);
    if (entry) {
      entry.units += line.quantity;
    } else {
      byProduct.set(line.productId, { price: line, units: line.quantity });
    }
  }

  let subtotal = 0;
  let regularTotal = 0;
  for (const { price, units } of byProduct.values()) {
    subtotal += productSubtotal(price, units);
    regularTotal += units * price.unitPrice;
  }
  return { subtotal, regularTotal, savings: regularTotal - subtotal };
}
