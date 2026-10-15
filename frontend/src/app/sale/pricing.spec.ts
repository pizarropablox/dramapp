import { calculateTotals, PricedLine, ProductPrice, productSubtotal } from './pricing';

const CERVEZA: ProductPrice = { productId: 1, unitPrice: 3000, promoQuantity: 2, promoPrice: 5000 };
const PISCOLA: ProductPrice = { productId: 2, unitPrice: 5500, promoQuantity: 3, promoPrice: 13000 };
const TROPICAL_GIN: ProductPrice = {
  productId: 5,
  unitPrice: 8500,
  promoQuantity: 2,
  promoPrice: 15000,
};
const JACK_DANIELS: ProductPrice = {
  productId: 9,
  unitPrice: 8500,
  promoQuantity: 2,
  promoPrice: 15000,
};
const RED_BULL: ProductPrice = { productId: 12, unitPrice: 3500, promoQuantity: null, promoPrice: null };

function line(price: ProductPrice, quantity: number): PricedLine {
  return { ...price, quantity };
}

describe('pricing', () => {
  it.each([
    [3, 13000],
    [4, 18500],
    [6, 26000],
    [2, 11000],
  ])('%i Piscola cost %i', (units, expected) => {
    expect(calculateTotals([line(PISCOLA, units)]).subtotal).toBe(expected);
  });

  it('3 Tropical Gin cost 23500 (one promo plus one single)', () => {
    expect(calculateTotals([line(TROPICAL_GIN, 3)]).subtotal).toBe(23500);
  });

  it('mixes variants of the same product into one promo', () => {
    const original = line(JACK_DANIELS, 1);
    const manzana = line(JACK_DANIELS, 1);

    expect(calculateTotals([original, manzana]).subtotal).toBe(15000);
  });

  it('charges products without promo at unit price', () => {
    expect(calculateTotals([line(RED_BULL, 2)]).subtotal).toBe(7000);
  });

  it('never mixes different products into a promo', () => {
    const cervezaNormal = line(CERVEZA, 1);
    const cervezaSinAlcohol = line(CERVEZA, 1);
    const piscola = line(PISCOLA, 1);

    expect(calculateTotals([cervezaNormal, cervezaSinAlcohol, piscola]).subtotal).toBe(10500);
  });

  it('does not apply a promo across two products with the same promo', () => {
    // Tropical Gin and Jack Daniels both have "2 x 15000", but one of each is not a promo.
    expect(calculateTotals([line(TROPICAL_GIN, 1), line(JACK_DANIELS, 1)]).subtotal).toBe(17000);
  });

  it('reports the regular total and the savings from promos', () => {
    const totals = calculateTotals([line(PISCOLA, 4), line(RED_BULL, 1)]);

    expect(totals).toEqual({ subtotal: 22000, regularTotal: 25500, savings: 3500 });
  });

  it('has no savings without promos', () => {
    expect(calculateTotals([line(PISCOLA, 1)]).savings).toBe(0);
  });

  it('is zero for an empty cart', () => {
    expect(calculateTotals([])).toEqual({ subtotal: 0, regularTotal: 0, savings: 0 });
  });

  it('computes a single product subtotal', () => {
    expect(productSubtotal(PISCOLA, 7)).toBe(2 * 13000 + 5500);
  });
});
