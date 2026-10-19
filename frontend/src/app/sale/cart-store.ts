import { computed, Injectable, signal } from '@angular/core';
import { ProductResponse, ProductVariantResponse } from '../product/product';
import { calculateTotals } from './pricing';
import { SaleLineRequest } from './sale';

/** A fresh object on every add, so adding the same variant twice still notifies. */
export interface AddedLine {
  variantId: number;
}

export interface CartLine {
  product: ProductResponse;
  variant: ProductVariantResponse;
  quantity: number;
}

/** The order being built at the bar. One line per variant. Provided per sale screen. */
@Injectable()
export class CartStore {
  private readonly linesState = signal<readonly CartLine[]>([]);

  readonly lines = this.linesState.asReadonly();

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

  add(product: ProductResponse, variant: ProductVariantResponse): void {
    if (this.linesState().some((line) => line.variant.id === variant.id)) {
      this.increment(variant.id);
    } else {
      this.linesState.update((lines) => [...lines, { product, variant, quantity: 1 }]);
    }
    this.lastAddedState.set({ variantId: variant.id });
  }

  increment(variantId: number): void {
    this.linesState.update((lines) =>
      lines.map((line) =>
        line.variant.id === variantId ? { ...line, quantity: line.quantity + 1 } : line,
      ),
    );
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
  }

  clear(): void {
    this.linesState.set([]);
    this.lastAddedState.set(null);
  }

  toRequestLines(): SaleLineRequest[] {
    return this.linesState().map((line) => ({ variantId: line.variant.id, quantity: line.quantity }));
  }
}
