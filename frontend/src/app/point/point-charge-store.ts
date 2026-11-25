import { inject, Service, signal } from '@angular/core';
import { ProductResponse } from '../product/product';
import { lineLabel } from '../sale/cart-storage';
import { CartLine, EmptiedCart } from '../sale/cart-store';
import { SaleResponse } from '../sale/sale';
import { TipChoice } from '../sale/tip-selector';
import { PointTerminal } from './point';
import { POINT_STORAGE } from './point-terminal-store';

export const POINT_CHARGE_STORAGE_KEY = 'dramapp.pointCharge';
/** Bumped when the format changes: an old charge is then discarded instead of misread. */
export const POINT_CHARGE_STORAGE_VERSION = 1;
/** An order lasts 3 hours on the Smart: older than this there is nothing left to follow. */
export const POINT_CHARGE_MAX_AGE_MS = 4 * 60 * 60_000;

/** A registered sale being charged with a Smart, with what is needed to go back to the cart. */
export interface PointCharge {
  saleId: number;
  kind: 'card' | 'cash';
  amount: number;
  terminal: PointTerminal;
  /** Epoch ms. */
  startedAt: number;
  /** label: only to name the line if it is no longer on the menu. */
  lines: readonly { variantId: number; quantity: number; label: string }[];
  tip: TipChoice;
  /** To void a cash sale from its screen. */
  sale: SaleResponse | null;
}

/** The last sale this phone printed, to print it again after going on. */
export interface LastVale {
  saleId: number;
  terminal: PointTerminal;
}

/**
 * The charge this phone waits for, app-wide and saved in its own key, so leaving Venta or reloading the page
 * finds it again. At most one per phone.
 */
@Service()
export class PointChargeStore {
  private readonly storage = inject(POINT_STORAGE);

  private readonly chargeState = signal<PointCharge | null>(this.load());

  readonly charge = this.chargeState.asReadonly();

  private readonly lastValeState = signal<LastVale | null>(null);

  /** Not saved: only since the app was opened. */
  readonly lastVale = this.lastValeState.asReadonly();

  private freshSaleId: number | null = null;

  /** Before the cart is emptied, so nothing is lost in between. */
  start(charge: PointCharge): void {
    this.freshSaleId = charge.saleId;
    this.chargeState.set(charge);
    try {
      this.storage?.setItem(
        POINT_CHARGE_STORAGE_KEY,
        JSON.stringify({ v: POINT_CHARGE_STORAGE_VERSION, ...charge }),
      );
    } catch {
      // It goes on; it just will not survive a reload.
    }
  }

  /** True only once, right after start(): a charge found after a reload is never sent on its own. */
  takeFresh(saleId: number): boolean {
    const fresh = this.freshSaleId === saleId;
    this.freshSaleId = null;
    return fresh;
  }

  /** Paid: its vale can still be printed again. */
  finishPaid(): void {
    const charge = this.chargeState();
    if (charge) {
      this.lastValeState.set({ saleId: charge.saleId, terminal: charge.terminal });
    }
    this.finish();
  }

  finish(): void {
    this.chargeState.set(null);
    this.freshSaleId = null;
    try {
      this.storage?.removeItem(POINT_CHARGE_STORAGE_KEY);
    } catch {
      // Its age discards it later.
    }
  }

  private load(): PointCharge | null {
    try {
      const saved: unknown = JSON.parse(this.storage?.getItem(POINT_CHARGE_STORAGE_KEY) ?? 'null');
      return isSavedCharge(saved) && Date.now() - saved.startedAt <= POINT_CHARGE_MAX_AGE_MS
        ? saved
        : null;
    } catch {
      return null;
    }
  }
}

export function chargeLines(lines: readonly CartLine[]): PointCharge['lines'] {
  return lines.map((line) => ({
    variantId: line.variant.id,
    quantity: line.quantity,
    label: lineLabel(line),
  }));
}

/** The cart as it was, rebuilt with the current menu. */
export function cartOfCharge(
  charge: PointCharge,
  menu: readonly ProductResponse[],
): { cart: EmptiedCart; removed: string[] } {
  const lines: CartLine[] = [];
  const removed: string[] = [];
  for (const line of charge.lines) {
    const product = menu.find((candidate) =>
      candidate.variants.some((variant) => variant.id === line.variantId),
    );
    const variant = product?.variants.find((candidate) => candidate.id === line.variantId);
    if (product && variant) {
      lines.push({ product, variant, quantity: line.quantity });
    } else {
      removed.push(line.label);
    }
  }
  return { cart: { lines, tip: charge.tip }, removed };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSavedCharge(value: unknown): value is PointCharge {
  return (
    isObject(value) &&
    value['v'] === POINT_CHARGE_STORAGE_VERSION &&
    Number.isInteger(value['saleId']) &&
    (value['kind'] === 'card' || value['kind'] === 'cash') &&
    Number.isInteger(value['amount']) &&
    Number.isFinite(value['startedAt']) &&
    isObject(value['terminal']) &&
    typeof value['terminal']['id'] === 'string' &&
    typeof value['terminal']['name'] === 'string' &&
    isObject(value['tip']) &&
    Number.isInteger(value['tip']['amount']) &&
    typeof value['tip']['custom'] === 'boolean' &&
    (value['sale'] === null || isObject(value['sale'])) &&
    Array.isArray(value['lines']) &&
    value['lines'].every(
      (line) =>
        isObject(line) &&
        Number.isInteger(line['variantId']) &&
        Number.isInteger(line['quantity']) &&
        typeof line['label'] === 'string',
    )
  );
}
