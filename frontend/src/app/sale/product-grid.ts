import { Component, input, output } from '@angular/core';
import { ProductResponse } from '../product/product';
import { ClpPipe } from '../shared/clp';

@Component({
  selector: 'app-product-grid',
  imports: [ClpPipe],
  template: `
    <ul class="grid">
      @for (product of products(); track product.id) {
        <li>
          <button type="button" class="product" (click)="selected.emit(product)">
            <span class="name">{{ product.name }}</span>
            <span class="price-row">
              <span class="price">{{ product.unitPrice | clp }}</span>
              @if (unitsByProduct().get(product.id); as units) {
                <span class="badge">
                  <span class="visually-hidden">En el carrito:</span>{{ units }}
                </span>
              }
            </span>
            @if (product.promoQuantity !== null && product.promoPrice !== null) {
              <span class="promo"
                >Promo {{ product.promoQuantity }} × {{ product.promoPrice | clp }}</span
              >
            }
          </button>
        </li>
      }
    </ul>
  `,
  styles: `
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .product {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.1rem;
      width: 100%;
      min-height: 4.5rem;
      padding: 0.45rem 0.6rem;
      text-align: left;
      background: var(--surface);
    }

    .product:active {
      background: var(--surface-2);
    }

    .name {
      font-weight: 700;
      font-size: 1.05rem;
      line-height: 1.2;
      padding-right: 2rem;
    }

    .price {
      font-size: 1.05rem;
    }

    .promo {
      font-size: 0.85rem;
      color: var(--accent);
    }

    .badge {
      position: absolute;
      top: 0.4rem;
      right: 0.4rem;
      min-width: 1.75rem;
      padding: 0.1rem 0.45rem;
      border-radius: 999px;
      background: var(--accent);
      color: var(--on-accent);
      font-weight: 700;
      text-align: center;
    }

    // Normal: the badge sits in the top right corner, beside the name.
    .price-row {
      display: contents;
    }

    // Larger text: the badge moves to the price row, so the name gets the whole width ("Jagger + Red
    // Bull" would otherwise take 3 lines) and less side padding leaves "Promo 3 × $12.000" on one line.
    :host-context([data-font-size]) {
      .product {
        padding-inline: 0.45rem;
      }

      .name {
        padding-right: 0;
      }

      .price-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.25rem;
        align-self: stretch;
      }

      .badge {
        position: static;
      }
    }
  `,
})
export class ProductGrid {
  readonly products = input.required<readonly ProductResponse[]>();
  readonly unitsByProduct = input<ReadonlyMap<number, number>>(new Map());
  readonly selected = output<ProductResponse>();
}
