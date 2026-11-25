import { TestBed } from '@angular/core/testing';
import { MemoryStorage } from '../../testing/memory-storage';
import { ProductResponse } from '../product/product';
import {
  cartOfCharge,
  chargeLines,
  POINT_CHARGE_MAX_AGE_MS,
  POINT_CHARGE_STORAGE_KEY,
  PointCharge,
  PointChargeStore,
} from './point-charge-store';
import { POINT_STORAGE } from './point-terminal-store';

const MENU: ProductResponse[] = [
  {
    id: 9,
    name: 'Jack Daniels',
    unitPrice: 8500,
    promoQuantity: 2,
    promoPrice: 15000,
    variants: [
      { id: 91, name: 'Original' },
      { id: 92, name: 'Manzana' },
    ],
  },
  {
    id: 12,
    name: 'Red Bull',
    unitPrice: 3500,
    promoQuantity: null,
    promoPrice: null,
    variants: [{ id: 121, name: 'Única' }],
  },
];

function charge(): PointCharge {
  return {
    saleId: 182,
    kind: 'card',
    amount: 18000,
    terminal: { id: 'SMART-1', name: 'Smart 1' },
    startedAt: Date.now(),
    lines: [
      { variantId: 92, quantity: 2, label: 'Jack Daniels Manzana' },
      { variantId: 121, quantity: 1, label: 'Red Bull' },
    ],
    tip: { amount: 1000, custom: false },
  };
}

describe('PointChargeStore', () => {
  let storage: MemoryStorage;

  /** A new app on the same phone. */
  function reload(): PointChargeStore {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: POINT_STORAGE, useValue: storage }] });
    return TestBed.inject(PointChargeStore);
  }

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  afterEach(() => vi.useRealTimers());

  it('has no charge by default', () => {
    expect(reload().charge()).toBeNull();
  });

  it('finds the charge again after a reload', () => {
    const started = charge();
    reload().start(started);

    expect(reload().charge()).toMatchObject(started);
  });

  it('is sent on its own only once, and never after a reload', () => {
    const store = reload();
    store.start(charge());

    expect(store.takeFresh(182)).toBe(true);
    expect(store.takeFresh(182)).toBe(false);

    store.start(charge());
    expect(reload().takeFresh(182)).toBe(false);
  });

  it('forgets it when it finishes', () => {
    const store = reload();
    store.start(charge());
    store.finish();

    expect(store.charge()).toBeNull();
    expect(storage.getItem(POINT_CHARGE_STORAGE_KEY)).toBeNull();
  });

  it('discards one that is too old to be followed', () => {
    reload().start({ ...charge(), startedAt: Date.now() - POINT_CHARGE_MAX_AGE_MS - 1000 });

    expect(reload().charge()).toBeNull();
  });

  it.each(['not json', '{}', '{"v":2}', '{"v":1,"saleId":"x"}'])(
    'ignores a corrupt one: %s',
    (saved) => {
      storage.setItem(POINT_CHARGE_STORAGE_KEY, saved);

      expect(reload().charge()).toBeNull();
    },
  );

  it('works without storage: it just does not survive a reload', () => {
    storage.failing = true;
    const store = reload();

    store.start(charge());
    expect(store.charge()?.saleId).toBe(182);
    store.finish();
    expect(store.charge()).toBeNull();
  });
});

describe('cartOfCharge', () => {
  it('rebuilds the lines with the current menu, and the tip', () => {
    const { cart, removed } = cartOfCharge(charge(), MENU);

    expect(cart.lines.map((line) => [line.variant.name, line.quantity])).toEqual([
      ['Manzana', 2],
      ['Única', 1],
    ]);
    expect(cart.lines[0].product).toBe(MENU[0]);
    expect(cart.tip).toEqual({ amount: 1000, custom: false });
    expect(removed).toEqual([]);
    expect(chargeLines(cart.lines)).toEqual(charge().lines);
  });

  it('names what is no longer on the menu', () => {
    const { cart, removed } = cartOfCharge(charge(), [MENU[1]]);

    expect(cart.lines).toHaveLength(1);
    expect(removed).toEqual(['Jack Daniels Manzana']);
  });
});
