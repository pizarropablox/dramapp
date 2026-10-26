import { computed, inject, Service, signal } from '@angular/core';
import { ProductResponse, ProductVariantResponse } from '../product/product';
import {
  CART_STORAGE,
  CartOwner,
  forgetCart,
  loadCart,
  PendingSale,
  RestoredCart,
  saveCart,
} from './cart-storage';
import { calculateTotals } from './pricing';
import { SaleLineRequest } from './sale';
import { NO_TIP, TipChoice } from './tip-selector';

/** A fresh object on every add, so adding the same variant twice still notifies. */
export interface AddedLine {
  variantId: number;
}

export interface CartLine {
  product: ProductResponse;
  variant: ProductVariantResponse;
  quantity: number;
}

/**
 * The order being built at the bar: one line per variant, and the tip. The payment method is not
 * here on purpose: it is chosen again after a reload, never preselected.
 * App-wide so the cart survives going to /totales and back; saved in localStorage so it also survives
 * a reload or closing the app (see cart-storage.ts). It is cleared once the sale is registered.
 */
@Service()
export class CartStore {
  private readonly storage = inject(CART_STORAGE);

  private readonly linesState = signal<readonly CartLine[]>([]);

  readonly lines = this.linesState.asReadonly();

  private readonly tipState = signal<TipChoice>(NO_TIP);

  readonly tip = this.tipState.asReadonly();

  private readonly pendingState = signal<PendingSale | null>(null);

  /** The sale being sent, or sent without an answer: it may have been registered. */
  readonly pending = this.pendingState.asReadonly();

  private readonly lastAddedState = signal<AddedLine | null>(null);

  /** The line touched by the latest add(), so the cart can scroll to it. */
  readonly lastAdded = this.lastAddedState.asReadonly();

  readonly isEmpty = computed(() => this.linesState().length === 0);

  readonly itemCount = computed(() =>
    this.linesState().reduce((count, line) => count + line.quantity, 0),
  );

  /** Units in the cart per product id, across all its variants. */
  readonly unitsByProduct = computed(() => {
    const units = new Map<number, number>();
    for (const line of this.linesState()) {
      units.set(line.product.id, (units.get(line.product.id) ?? 0) + line.quantity);
    }
    return units;
  });

  readonly totals = computed(() =>
    calculateTotals(
      this.linesState().map((line) => ({
        productId: line.product.id,
        unitPrice: line.product.unitPrice,
        promoQuantity: line.product.promoQuantity,
        promoPrice: line.product.promoPrice,
        quantity: line.quantity,
      })),
    ),
  );

  private owner: CartOwner | null = null;
  /** Nothing is saved until the saved cart was restored (or discarded), so it is never overwritten. */
  private attached = false;

  /**
   * Tells whose cart this is, once the open event, the user and the menu are known. The first call in
   * the page load restores the saved cart; later ones only keep the owner up to date.
   * Returns what was restored, or null.
   */
  attach(owner: CartOwner, menu: readonly ProductResponse[] | null): RestoredCart | null {
    const changed =
      owner.eventId !== this.owner?.eventId || owner.username !== this.owner?.username;
    this.owner = owner;
    if (this.attached) {
      // Only when the owner changed: the event is polled every minute, and saving refreshes the 2 hours.
      if (changed) {
        this.save();
      }
      return null;
    }
    if (owner.eventId !== null && menu === null) {
      return null; // The cart is rebuilt with the current menu: wait for it.
    }
    this.attached = true;
    const restored = this.isEmpty() ? loadCart(this.storage, owner, menu ?? [], Date.now()) : null;
    if (restored) {
      this.linesState.set(restored.lines);
      this.tipState.set(restored.tip);
      this.pendingState.set(restored.pending);
    }
    this.save();
    return restored;
  }

  add(product: ProductResponse, variant: ProductVariantResponse): void {
    if (this.linesState().some((line) => line.variant.id === variant.id)) {
      this.increment(variant.id);
    } else {
      this.linesState.update((lines) => [...lines, { product, variant, quantity: 1 }]);
      this.save();
    }
    this.lastAddedState.set({ variantId: variant.id });
  }

  increment(variantId: number): void {
    this.linesState.update((lines) =>
      lines.map((line) =>
        line.variant.id === variantId ? { ...line, quantity: line.quantity + 1 } : line,
      ),
    );
    this.save();
  }

  /** Removes one unit; the line disappears when it reaches 0. */
  decrement(variantId: number): void {
    this.linesState.update((lines) =>
      lines
        .map((line) =>
          line.variant.id === variantId ? { ...line, quantity: line.quantity - 1 } : line,
        )
        .filter((line) => line.quantity > 0),
    );
    this.save();
  }

  setTip(tip: TipChoice): void {
    this.tipState.set(tip);
    this.save();
  }

  /**
   * "Vaciar": removes the lines (the tip stays) and forgets the saved cart, so a reload brings back
   * nothing. Returns the removed lines, for "Deshacer".
   */
  empty(): readonly CartLine[] {
    const lines = this.linesState();
    this.linesState.set([]);
    this.lastAddedState.set(null);
    forgetCart(this.storage);
    return lines;
  }

  /** "Deshacer" after empty(). */
  putBack(lines: readonly CartLine[]): void {
    this.linesState.set(lines);
    this.save();
  }

  /** Right before sending the sale: until the answer comes, a reload shows it may have been registered. */
  markSending(pending: PendingSale): void {
    this.pendingState.set(pending);
    this.save();
  }

  /** The backend said the sale was not registered (or the cashier checked): it can be confirmed again. */
  markNotSent(): void {
    this.pendingState.set(null);
    this.save();
  }

  /** The sale was registered, or the session ended on purpose: a new, empty order. */
  clear(): void {
    this.linesState.set([]);
    this.tipState.set(NO_TIP);
    this.pendingState.set(null);
    this.lastAddedState.set(null);
    forgetCart(this.storage);
  }

  toRequestLines(): SaleLineRequest[] {
    return this.linesState().map((line) => ({
      variantId: line.variant.id,
      quantity: line.quantity,
    }));
  }

  private save(): void {
    if (!this.attached) {
      return;
    }
    if (this.isEmpty() && !this.pendingState()) {
      forgetCart(this.storage);
      return;
    }
    const owner = this.owner;
    // Without an open event nothing can be sold: the saved cart would be discarded anyway.
    if (owner?.eventId == null) {
      return;
    }
    saveCart(
      this.storage,
      { eventId: owner.eventId, username: owner.username },
      { lines: this.linesState(), tip: this.tipState(), pending: this.pendingState() },
      Date.now(),
    );
  }
}
