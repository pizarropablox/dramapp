import { calculateTotals, PricedLine, ProductPrice, productSubtotal } from './pricing';

const CERVEZA: ProductPrice = { productId: 1, unitPrice: 3000, promoQuantity: 2, promoPrice: 5000 };
const PISCOLA_MISTRAL: ProductPrice = {
  productId: 4,
  unitPrice: 6000,
  promoQuantity: 3,
  promoPrice: 14000,
};
const TROPICAL_GIN: ProductPrice = {
  productId: 5,
  unitPrice: 8500,
  promoQuantity: 2,
  promoPrice: 14000,
};
const JACK_DANIELS: ProductPrice = {
  productId: 9,
  unitPrice: 8500,
  promoQuantity: 2,
  promoPrice: 15000,
};
const JAGGER_RED_BULL: ProductPrice = {
  productId: 10,
  unitPrice: 8500,
  promoQuantity: 2,
  promoPrice: 15000,
};
const RED_BULL: ProductPrice = {
  productId: 12,
  unitPrice: 3500,
  promoQuantity: null,
  promoPrice: null,
};

function line(price: ProductPrice, quantity: number): PricedLine {
  return { ...price, quantity };
}

describe('pricing', () => {
  it.each([
    [3, 14000],
    [4, 20000],
    [6, 28000],
    [2, 12000],
  ])('%i Piscola Mistral cost %i', (units, expected) => {
    expect(calculateTotals([line(PISCOLA_MISTRAL, units)]).subtotal).toBe(expected);
  });

  it('3 Tropical Gin cost 22500 (one promo plus one single)', () => {
    expect(calculateTotals([line(TROPICAL_GIN, 3)]).subtotal).toBe(22500);
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
    const piscolaMistral = line(PISCOLA_MISTRAL, 1);

    expect(calculateTotals([cervezaNormal, cervezaSinAlcohol, piscolaMistral]).subtotal).toBe(
      11000,
    );
  });

  it('does not apply a promo across two products with the same promo', () => {
    // Jack Daniels and Jagger + Red Bull both have "2 x 15000", but one of each is not a promo.
    expect(calculateTotals([line(JACK_DANIELS, 1), line(JAGGER_RED_BULL, 1)]).subtotal).toBe(17000);
  });

  it('reports the regular total and the savings from promos', () => {
    const totals = calculateTotals([line(PISCOLA_MISTRAL, 4), line(RED_BULL, 1)]);

    expect(totals).toEqual({ subtotal: 23500, regularTotal: 27500, savings: 4000 });
  });

  it('has no savings without promos', () => {
    expect(calculateTotals([line(PISCOLA_MISTRAL, 1)]).savings).toBe(0);
  });

  it('is zero for an empty cart', () => {
    expect(calculateTotals([])).toEqual({ subtotal: 0, regularTotal: 0, savings: 0 });
  });

  it('computes a single product subtotal', () => {
    expect(productSubtotal(PISCOLA_MISTRAL, 7)).toBe(2 * 14000 + 6000);
  });
});
