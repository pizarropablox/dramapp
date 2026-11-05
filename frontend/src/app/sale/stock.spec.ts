import { HttpErrorResponse } from '@angular/common/http';
import { ProductResponse } from '../product/product';
import {
  isProductOutOfStock,
  outOfStockConflict,
  outOfStockFromIds,
  outOfStockFromMarks,
  outOfStockFromMenu,
} from './stock';

const SINCE = '2026-11-01T06:30:00Z';

const JACK: ProductResponse = {
  id: 9,
  name: 'Jack Daniels',
  unitPrice: 8500,
  promoQuantity: null,
  promoPrice: null,
  variants: [
    { id: 91, name: 'Original', outOfStockSince: null },
    { id: 92, name: 'Manzana', outOfStockSince: SINCE },
  ],
};

function conflict(body: unknown): HttpErrorResponse {
  return new HttpErrorResponse({ status: 409, error: body });
}

describe('stock', () => {
  it('reads the marks of the menu, also from a backend that does not send them', () => {
    const older = { ...JACK, id: 1, variants: [{ id: 11, name: 'Normal' }] };

    expect([...outOfStockFromMenu([JACK, older])]).toEqual([[92, SINCE]]);
  });

  it('reads the marks of an answer', () => {
    expect([...outOfStockFromMarks([{ variantId: 92, since: SINCE }])]).toEqual([[92, SINCE]]);
  });

  it('keeps the times it knows when only ids come, and forgets what is no longer out', () => {
    const current = new Map([
      [92, SINCE],
      [11, SINCE],
    ]);

    expect([...outOfStockFromIds(current, [92, 12])]).toEqual([
      [92, SINCE],
      [12, null],
    ]);
  });

  it('a product is out when every variant on the menu is', () => {
    expect(isProductOutOfStock(JACK, new Map([[92, SINCE]]))).toBe(false);
    expect(
      isProductOutOfStock(
        JACK,
        new Map([
          [91, SINCE],
          [92, SINCE],
        ]),
      ),
    ).toBe(true);
  });

  describe('outOfStockConflict', () => {
    it('reads the marks of its 409', () => {
      const error = conflict({ code: 'OUT_OF_STOCK', outOfStockVariantIds: [92] });

      expect(outOfStockConflict(error)).toEqual([92]);
    });

    it('does not take the 409 of a closed event for it', () => {
      expect(outOfStockConflict(conflict({ title: 'Sin evento abierto' }))).toBeNull();
      expect(outOfStockConflict(conflict(null))).toBeNull();
    });

    it('ignores any other error', () => {
      const error = new HttpErrorResponse({ status: 400, error: { code: 'OUT_OF_STOCK' } });

      expect(outOfStockConflict(error)).toBeNull();
      expect(outOfStockConflict(new Error('boom'))).toBeNull();
    });
  });
});
