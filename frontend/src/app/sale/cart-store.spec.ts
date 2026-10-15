import { ProductResponse } from '../product/product';
import { CartStore } from './cart-store';

const JACK: ProductResponse = {
  id: 9,
  name: 'Jack Daniels',
  unitPrice: 8500,
  promoQuantity: 2,
  promoPrice: 15000,
  variants: [
    { id: 91, name: 'Original' },
    { id: 92, name: 'Manzana' },
  ],
};

const RED_BULL: ProductResponse = {
  id: 12,
  name: 'Red Bull',
  unitPrice: 3500,
  promoQuantity: null,
  promoPrice: null,
  variants: [{ id: 121, name: 'Única' }],
};

const [ORIGINAL, MANZANA] = JACK.variants;
const [RED_BULL_SINGLE] = RED_BULL.variants;

describe('CartStore', () => {
  let cart: CartStore;

  beforeEach(() => {
    cart = new CartStore();
  });

  it('starts empty', () => {
    expect(cart.isEmpty()).toBe(true);
    expect(cart.itemCount()).toBe(0);
    expect(cart.totals().subtotal).toBe(0);
  });

  it('adds a new line per variant', () => {
    cart.add(JACK, ORIGINAL);
    cart.add(JACK, MANZANA);

    expect(cart.lines().map((line) => [line.variant.name, line.quantity])).toEqual([
      ['Original', 1],
      ['Manzana', 1],
    ]);
  });

  it('adding the same variant again increases its quantity', () => {
    cart.add(RED_BULL, RED_BULL_SINGLE);
    cart.add(RED_BULL, RED_BULL_SINGLE);

    expect(cart.lines()).toHaveLength(1);
    expect(cart.lines()[0].quantity).toBe(2);
  });

  it('increments a line', () => {
    cart.add(RED_BULL, RED_BULL_SINGLE);

    cart.increment(RED_BULL_SINGLE.id);

    expect(cart.lines()[0].quantity).toBe(2);
    expect(cart.itemCount()).toBe(2);
  });

  it('decrements a line', () => {
    cart.add(RED_BULL, RED_BULL_SINGLE);
    cart.increment(RED_BULL_SINGLE.id);

    cart.decrement(RED_BULL_SINGLE.id);

    expect(cart.lines()[0].quantity).toBe(1);
  });

  it('removes a line when its quantity reaches 0', () => {
    cart.add(JACK, ORIGINAL);
    cart.add(RED_BULL, RED_BULL_SINGLE);

    cart.decrement(ORIGINAL.id);

    expect(cart.lines().map((line) => line.variant.id)).toEqual([RED_BULL_SINGLE.id]);
  });

  it('clears all lines', () => {
    cart.add(JACK, ORIGINAL);
    cart.add(RED_BULL, RED_BULL_SINGLE);

    cart.clear();

    expect(cart.isEmpty()).toBe(true);
    expect(cart.totals().subtotal).toBe(0);
  });

  it('totals apply promos across variants of the same product', () => {
    cart.add(JACK, ORIGINAL);
    cart.add(JACK, MANZANA);
    cart.add(RED_BULL, RED_BULL_SINGLE);

    expect(cart.totals()).toEqual({ subtotal: 18500, regularTotal: 20500, savings: 2000 });
  });

  it('counts units per product across variants', () => {
    cart.add(JACK, ORIGINAL);
    cart.add(JACK, MANZANA);
    cart.increment(MANZANA.id);

    expect(cart.unitsByProduct().get(JACK.id)).toBe(3);
  });

  it('builds the request lines without prices', () => {
    cart.add(JACK, MANZANA);
    cart.increment(MANZANA.id);
    cart.add(RED_BULL, RED_BULL_SINGLE);

    expect(cart.toRequestLines()).toEqual([
      { variantId: MANZANA.id, quantity: 2 },
      { variantId: RED_BULL_SINGLE.id, quantity: 1 },
    ]);
  });
});
