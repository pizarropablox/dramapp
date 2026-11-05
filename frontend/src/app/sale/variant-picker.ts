import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { ProductResponse, ProductVariantResponse } from '../product/product';
import { NOTHING_OUT_OF_STOCK, OutOfStock } from './stock';

/**
 * Bottom sheet to pick a variant. Tapping a variant picks it right away; the first one that can be sold is
 * highlighted. One «Agotado» stays in its place, in grey: the page offers «¿Llegó más?» instead of adding it.
 */
@Component({
  selector: 'app-variant-picker',
  host: { '(document:keydown.escape)': 'cancelled.emit()' },
  template: `
    <div class="backdrop" (click)="cancelled.emit()"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="variant-picker-title">
      <h2 id="variant-picker-title">{{ product().name }}</h2>
      <div class="variants">
        @for (variant of product().variants; track variant.id) {
          @if (variant.id === firstAvailableId()) {
            <button
              #firstVariant
              type="button"
              class="variant primary"
              (click)="picked.emit(variant)"
            >
              {{ variant.name }}
            </button>
          } @else {
            <button
              type="button"
              class="variant"
              [class.out-of-stock]="outOfStock().has(variant.id)"
              (click)="picked.emit(variant)"
            >
              {{ variant.name }}
              @if (outOfStock().has(variant.id)) {
                <span class="sold-out">Agotado</span>
              }
            </button>
          }
        }
      </div>
      <button type="button" class="cancel" (click)="cancelled.emit()">Cancelar</button>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 10;
      background: rgb(0 0 0 / 60%);
    }

    .sheet {
      position: fixed;
      inset: auto 0 0;
      z-index: 11;
      padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
      border-radius: 1rem 1rem 0 0;
      background: var(--surface);
      box-shadow: 0 -4px 24px rgb(0 0 0 / 50%);
    }

    h2 {
      margin: 0 0 0.75rem;
      font-size: 1.25rem;
    }

    .variants {
      display: grid;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }

    .variant {
      min-height: 3.5rem;
      font-size: 1.15rem;
      font-weight: 600;
    }

    .primary {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--on-accent);
    }

    // Same stripes as the Venta grid.
    .out-of-stock {
      border-style: dashed;
      background: repeating-linear-gradient(135deg, var(--bg) 0 0.5rem, var(--surface) 0.5rem 1rem);
      color: var(--muted);
    }

    .sold-out {
      margin-left: 0.4rem;
      color: var(--text);
      font-size: 0.95rem;
      font-weight: 700;
      text-transform: uppercase;
    }

    .cancel {
      width: 100%;
      background: transparent;
    }
  `,
})
export class VariantPicker {
  readonly product = input.required<ProductResponse>();
  readonly outOfStock = input<OutOfStock>(NOTHING_OUT_OF_STOCK);
  readonly picked = output<ProductVariantResponse>();
  readonly cancelled = output<void>();

  /** Undefined when every variant is out: nothing is highlighted. */
  protected readonly firstAvailableId = computed(
    () => this.product().variants.find((variant) => !this.outOfStock().has(variant.id))?.id,
  );

  private readonly firstVariant = viewChild<ElementRef<HTMLButtonElement>>('firstVariant');

  constructor() {
    afterNextRender(() => this.firstVariant()?.nativeElement.focus());
  }
}
