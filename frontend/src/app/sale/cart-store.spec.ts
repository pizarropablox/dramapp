import { TestBed } from '@angular/core/testing';
import { ProductResponse } from '../product/product';
import { MemoryStorage } from '../../testing/memory-storage';
import { CART_STORAGE, CART_STORAGE_KEY } from './cart-storage';
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
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    TestBed.configureTestingModule({ providers: [{ provide: CART_STORAGE, useValue: storage }] });
    cart = TestBed.inject(CartStore);
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

  it('remembers the latest added line, notifying even for the same variant', () => {
    expect(cart.lastAdded()).toBeNull();

    cart.add(RED_BULL, RED_BULL_SINGLE);
    const first = cart.lastAdded();
    cart.add(RED_BULL, RED_BULL_SINGLE);

    expect(cart.lastAdded()).toEqual({ variantId: RED_BULL_SINGLE.id });
    expect(cart.lastAdded()).not.toBe(first);

    cart.clear();
    expect(cart.lastAdded()).toBeNull();
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

  describe('saved in the storage', () => {
    const OWNER = { eventId: 7, username: 'barra' };

    function saved(): Record<string, unknown> | null {
      return storage.json(CART_STORAGE_KEY) as Record<string, unknown> | null;
    }

    it('saves nothing before the saved cart was restored, so it is never overwritten', () => {
      storage.setItem(CART_STORAGE_KEY, 'previous');

      cart.add(RED_BULL, RED_BULL_SINGLE);

      expect(storage.getItem(CART_STORAGE_KEY)).toBe('previous');
    });

    it('waits for the menu to restore while there is an open event', () => {
      cart.attach(OWNER, [RED_BULL]);
      cart.add(RED_BULL, RED_BULL_SINGLE);
      cart.setTip({ amount: 500, custom: false });
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [{ provide: CART_STORAGE, useValue: storage }] });
      const reloaded = TestBed.inject(CartStore);

      expect(reloaded.attach(OWNER, null)).toBeNull();
      const restored = reloaded.attach(OWNER, [RED_BULL]);

      expect(restored?.lines).toHaveLength(1);
      expect(reloaded.itemCount()).toBe(1);
      expect(reloaded.tip()).toEqual({ amount: 500, custom: false });
      expect(reloaded.attach(OWNER, [RED_BULL])).toBeNull();
    });

    it('saves every change once attached, and forgets an empty cart', () => {
      cart.attach(OWNER, [JACK, RED_BULL]);

      cart.add(JACK, MANZANA);
      cart.increment(MANZANA.id);
      expect(saved()?.['lines']).toEqual([
        { variantId: MANZANA.id, quantity: 2, label: 'Jack Daniels Manzana' },
      ]);

      cart.setTip({ amount: 2000, custom: false });
      expect(saved()?.['tip']).toEqual({ amount: 2000, custom: false });

      cart.decrement(MANZANA.id);
      cart.decrement(MANZANA.id);
      expect(saved()).toBeNull();
    });

    it('saves nothing without an open event', () => {
      cart.attach({ eventId: null, username: 'barra' }, null);

      cart.add(RED_BULL, RED_BULL_SINGLE);

      expect(saved()).toBeNull();
    });

    it('does not refresh the 2 hours when the same owner is attached again (event polling)', () => {
      vi.useFakeTimers({ now: 1_000 });
      try {
        cart.attach(OWNER, [RED_BULL]);
        cart.add(RED_BULL, RED_BULL_SINGLE);
        vi.setSystemTime(61_000);

        cart.attach(OWNER, [RED_BULL]);
        expect(saved()?.['savedAt']).toBe(1_000);

        cart.attach({ ...OWNER, eventId: 8 }, [RED_BULL]);
        expect(saved()).toMatchObject({ eventId: 8, savedAt: 61_000 });
      } finally {
        vi.useRealTimers();
      }
    });

    it('keeps the cart "sending" until told whether the sale was registered', () => {
      cart.attach(OWNER, [RED_BULL]);
      cart.add(RED_BULL, RED_BULL_SINGLE);
      const pending = { paymentMethod: 'EFECTIVO' as const, amountToCharge: 3500, startedAt: 5 };

      cart.markSending(pending);
      expect(cart.pending()).toEqual(pending);
      expect(saved()).toMatchObject({ status: 'sending', sending: pending });

      cart.markNotSent();
      expect(cart.pending()).toBeNull();
      expect(saved()).toMatchObject({ status: 'editing', sending: null });
    });

    it('"Vaciar" forgets the saved cart but keeps the tip, and "Deshacer" saves it again', () => {
      cart.attach(OWNER, [RED_BULL]);
      cart.add(RED_BULL, RED_BULL_SINGLE);
      cart.setTip({ amount: 500, custom: false });

      const removed = cart.empty();
      expect(cart.isEmpty()).toBe(true);
      expect(cart.tip().amount).toBe(500);
      expect(saved()).toBeNull();

      cart.putBack(removed);
      expect(cart.itemCount()).toBe(1);
      expect(saved()?.['lines']).toHaveLength(1);
    });

    it('clear() empties lines, tip and pending sale, and forgets the saved cart', () => {
      cart.attach(OWNER, [RED_BULL]);
      cart.add(RED_BULL, RED_BULL_SINGLE);
      cart.setTip({ amount: 500, custom: false });
      cart.markSending({ paymentMethod: 'EFECTIVO', amountToCharge: 4000, startedAt: 5 });

      cart.clear();

      expect(cart.tip().amount).toBe(0);
      expect(cart.pending()).toBeNull();
      expect(saved()).toBeNull();
    });
  });
});
