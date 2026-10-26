import { ProductResponse } from '../product/product';
import { MemoryStorage } from '../../testing/memory-storage';
import {
  CART_MAX_AGE_MS,
  CART_STORAGE_KEY,
  CartOwner,
  forgetCart,
  loadCart,
  saveCart,
} from './cart-storage';
import { CartLine } from './cart-store';
import { NO_TIP } from './tip-selector';

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

const PISCOLA: ProductResponse = {
  id: 20,
  name: 'Piscola',
  unitPrice: 4000,
  promoQuantity: null,
  promoPrice: null,
  variants: [{ id: 201, name: 'Única' }],
};

const MENU = [JACK, PISCOLA];
const OWNER = { eventId: 7, username: 'barra' };
const NOW = Date.parse('2026-10-31T23:00:00Z');

function line(product: ProductResponse, variantIndex: number, quantity: number): CartLine {
  return { product, variant: product.variants[variantIndex], quantity };
}

describe('cart storage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  function save(lines: CartLine[], extra: Partial<Parameters<typeof saveCart>[2]> = {}): void {
    saveCart(storage, OWNER, { lines, tip: NO_TIP, pending: null, ...extra }, NOW);
  }

  /** Writes the raw saved JSON, changed by edit. */
  function tamper(edit: (saved: Record<string, unknown>) => void): void {
    const saved = storage.json(CART_STORAGE_KEY) as Record<string, unknown>;
    edit(saved);
    storage.setItem(CART_STORAGE_KEY, JSON.stringify(saved));
  }

  function load(owner: CartOwner = OWNER, menu = MENU, now = NOW) {
    return loadCart(storage, owner, menu, now);
  }

  it('saves only variant ids, quantities and names, never prices', () => {
    save([line(JACK, 1, 2)], { tip: { amount: 1000, custom: false } });

    expect(storage.json(CART_STORAGE_KEY)).toEqual({
      v: 1,
      eventId: 7,
      username: 'barra',
      savedAt: NOW,
      status: 'editing',
      sending: null,
      lines: [{ variantId: 92, quantity: 2, label: 'Jack Daniels Manzana' }],
      tip: { amount: 1000, custom: false },
    });
  });

  it('rebuilds the cart with the current menu and prices', () => {
    save([line(JACK, 1, 2), line(PISCOLA, 0, 1)], { tip: { amount: 1500, custom: true } });
    const repriced = { ...JACK, unitPrice: 9000 };

    const restored = load(OWNER, [repriced, PISCOLA]);

    expect(restored?.lines).toEqual([line(repriced, 1, 2), line(PISCOLA, 0, 1)]);
    expect(restored?.lines[0].product.unitPrice).toBe(9000);
    expect(restored?.tip).toEqual({ amount: 1500, custom: true });
    expect(restored?.pending).toBeNull();
    expect(restored?.removed).toEqual([]);
  });

  it('restores a sale being sent, with what was sent', () => {
    const pending = { paymentMethod: 'EFECTIVO' as const, amountToCharge: 8500, startedAt: NOW };
    save([line(JACK, 0, 1)], { pending });

    expect(storage.json(CART_STORAGE_KEY)).toMatchObject({ status: 'sending', sending: pending });
    expect(load()?.pending).toEqual(pending);
  });

  it.each([
    ['another event', { eventId: 8, username: 'barra' }],
    ['another user', { eventId: 7, username: 'admin' }],
    ['no open event', { eventId: null, username: 'barra' }],
  ])('discards and forgets the cart of %s', (_, owner) => {
    save([line(JACK, 0, 1)]);

    expect(load(owner)).toBeNull();
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('keeps a cart up to 2 hours after the last change, and discards it after that', () => {
    save([line(JACK, 0, 1)]);
    expect(load(OWNER, MENU, NOW + CART_MAX_AGE_MS)?.lines).toHaveLength(1);

    expect(load(OWNER, MENU, NOW + CART_MAX_AGE_MS + 1)).toBeNull();
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('drops and names the products no longer on the menu', () => {
    save([line(JACK, 0, 1), line(PISCOLA, 0, 2)]);

    const restored = load(OWNER, [JACK]);

    expect(restored?.lines).toEqual([line(JACK, 0, 1)]);
    expect(restored?.removed).toEqual(['Piscola']);
  });

  it('drops a variant deactivated in a product that is still on the menu', () => {
    save([line(JACK, 1, 1)]);

    const restored = load(OWNER, [{ ...JACK, variants: [JACK.variants[0]] }]);

    expect(restored?.lines).toEqual([]);
    expect(restored?.removed).toEqual(['Jack Daniels Manzana']);
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('drops lines with corrupt quantities', () => {
    save([line(JACK, 0, 1)]);
    tamper((saved) => {
      saved['lines'] = [
        { variantId: 91, quantity: 0, label: 'a' },
        { variantId: 91, quantity: -1, label: 'b' },
        { variantId: 91, quantity: 1.5, label: 'c' },
        { variantId: 91, quantity: 100, label: 'd' },
        { variantId: 91, quantity: '2', label: 'e' },
        { variantId: 92, quantity: 99, label: 'Jack Daniels Manzana' },
      ];
    });

    expect(load()?.lines).toEqual([line(JACK, 1, 99)]);
  });

  it.each([
    { amount: 10_001, custom: true },
    { amount: -500, custom: false },
    { amount: 1.5 },
    'x',
  ])('brings back an invalid tip (%j) as no tip', (tip) => {
    save([line(JACK, 0, 1)]);
    tamper((saved) => (saved['tip'] = tip));

    expect(load()?.tip).toEqual(NO_TIP);
  });

  it.each([
    ['corrupt JSON', () => storage.setItem(CART_STORAGE_KEY, '{"v":1,')],
    ['another version', () => tamper((saved) => (saved['v'] = 2))],
    ['no lines', () => tamper((saved) => delete saved['lines'])],
    ['sending without details', () => tamper((saved) => (saved['status'] = 'sending'))],
  ])('discards and forgets %s', (_, corrupt) => {
    save([line(JACK, 0, 1)]);
    corrupt();

    expect(load()).toBeNull();
    expect(storage.getItem(CART_STORAGE_KEY)).toBeNull();
  });

  it('never throws when the storage fails or is missing', () => {
    save([line(JACK, 0, 1)]);
    storage.failing = true;

    expect(load()).toBeNull();
    expect(() => save([line(JACK, 0, 2)])).not.toThrow();
    expect(() => forgetCart(storage)).not.toThrow();
    expect(loadCart(null, OWNER, MENU, NOW)).toBeNull();
    expect(() =>
      saveCart(null, OWNER, { lines: [], tip: NO_TIP, pending: null }, NOW),
    ).not.toThrow();
  });
});
