import { HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { ProductResponse, StockOutResponse } from '../product/product';
import { errorMessage, NO_CONNECTION_MESSAGE } from '../shared/api-error';

/**
 * What is «Agotado» in the open event (DRAMA-51): variant id → since when. Null when the time is not known yet:
 * the answer to a sale brings only ids. Kept apart from the menu, so a mark changes colors and nothing else.
 */
export type OutOfStock = ReadonlyMap<number, string | null>;

export const NOTHING_OUT_OF_STOCK: OutOfStock = new Map();

export function outOfStockFromMenu(menu: readonly ProductResponse[]): OutOfStock {
  const marks = new Map<number, string | null>();
  for (const product of menu) {
    for (const variant of product.variants) {
      if (variant.outOfStockSince) {
        marks.set(variant.id, variant.outOfStockSince);
      }
    }
  }
  return marks;
}

export function outOfStockFromMarks(marks: readonly StockOutResponse[]): OutOfStock {
  return new Map(marks.map((mark) => [mark.variantId, mark.since]));
}

/** The answer to a sale: the marks are these ids, keeping the times already known. */
export function outOfStockFromIds(current: OutOfStock, ids: readonly number[]): OutOfStock {
  return new Map(ids.map((id) => [id, current.get(id) ?? null]));
}

/** Every variant on the menu is out: the product's button goes grey too. */
export function isProductOutOfStock(product: ProductResponse, marks: OutOfStock): boolean {
  return product.variants.every((variant) => marks.has(variant.id));
}

/** Why marking failed. Past the timeout there is no answer to show: the signal at the bar, most likely. */
export function stockErrorMessage(error: unknown): string {
  return error instanceof TimeoutError ? NO_CONNECTION_MESSAGE : errorMessage(error);
}

/** The event was closed from another phone, or the item left the menu: what this phone shows is old. */
export function isStockConflict(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === HttpStatusCode.Conflict;
}

/** Mirrors the backend's OutOfStockSaleException.CODE. */
const OUT_OF_STOCK_CODE = 'OUT_OF_STOCK';

/**
 * The marks in a 409 from POST /api/sales saying a line ran out, or null for any other error. The code tells it
 * apart from the 409 of a closed event.
 */
export function outOfStockConflict(error: unknown): number[] | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== HttpStatusCode.Conflict) {
    return null;
  }
  const body = error.error as { code?: unknown; outOfStockVariantIds?: unknown } | null;
  return body?.code === OUT_OF_STOCK_CODE ? ((body.outOfStockVariantIds as number[]) ?? []) : null;
}
