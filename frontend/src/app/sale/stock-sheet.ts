import {
  afterNextRender,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ProductResponse, ProductVariantResponse, StockOutResponse } from '../product/product';
import { ProductService } from '../product/product.service';
import { formatTime } from '../shared/time';
import { lineLabel } from './cart-storage';
import { isStockConflict, OutOfStock, stockErrorMessage } from './stock';

/**
 * Marks what ran out during the night (DRAMA-51), in the order of the Venta grid. A tap marks or unmarks right away,
 * with no confirmation: it is reversible, and getting here already takes a deliberate tap away from the grid.
 * One request at a time, and the sheet stays open until it is answered: closing would cancel a mark the cashier
 * believes is done. The sheet covers the checkout, so a sale cannot start meanwhile.
 */
@Component({
  selector: 'app-stock-sheet',
  host: { '(document:keydown.escape)': 'close()' },
  template: `
    <div class="backdrop" (click)="close()"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="stock-sheet-title">
      <h2 id="stock-sheet-title">Agotados</h2>
      <p class="note">Lo que marques se ve en gris en todos los teléfonos.</p>
      <div class="rows">
        @for (product of products(); track product.id) {
          @for (variant of product.variants; track variant.id) {
            <button
              type="button"
              class="row"
              role="switch"
              [class.marked]="marks().has(variant.id)"
              [attr.aria-checked]="marks().has(variant.id)"
              [attr.aria-busy]="saving() === variant.id"
              (click)="toggle(product, variant)"
            >
              <span class="text">
                <span class="name">{{ label(product, variant) }}</span>
                @if (saving() === variant.id) {
                  <span class="state">Guardando…</span>
                } @else if (marks().has(variant.id)) {
                  <span class="state">{{ since(variant) }}</span>
                }
              </span>
              <span class="switch" aria-hidden="true"></span>
            </button>
          }
        }
      </div>
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <button
        #closeButton
        type="button"
        class="close"
        [disabled]="saving() !== null"
        (click)="close()"
      >
        Cerrar
      </button>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 10;
      background: rgb(0 0 0 / 60%);
    }

    // Never as tall as the screen: the close button stays in view and the rows scroll.
    .sheet {
      position: fixed;
      inset: auto 0 0;
      z-index: 11;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      max-height: calc(92dvh - var(--update-bar-height));
      padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
      border-radius: 1rem 1rem 0 0;
      background: var(--surface);
      box-shadow: 0 -4px 24px rgb(0 0 0 / 50%);
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .note {
      margin: 0;
      color: var(--muted);
      font-size: 0.9rem;
    }

    .rows {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    // Tall enough for the name and the state: a row does not grow when it is marked.
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      width: 100%;
      min-height: 3.5rem;
      padding: 0.25rem 0.25rem 0.25rem 0;
      border: none;
      border-bottom: 1px solid var(--border);
      border-radius: 0;
      background: transparent;
      text-align: left;
    }

    .text {
      display: grid;
      gap: 0.1rem;
      min-width: 0;
    }

    .name {
      font-weight: 600;
      line-height: 1.2;
    }

    .state {
      color: var(--muted);
      font-size: 0.85rem;
      line-height: 1.2;
    }

    .switch {
      position: relative;
      flex: none;
      width: 3rem;
      height: 1.75rem;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--surface-2);
    }

    .switch::after {
      content: '';
      position: absolute;
      top: 0.15rem;
      left: 0.15rem;
      width: 1.35rem;
      height: 1.35rem;
      border-radius: 50%;
      background: var(--muted);
    }

    .marked .switch {
      border-color: var(--accent);
      background: var(--accent);
    }

    .marked .switch::after {
      left: auto;
      right: 0.15rem;
      background: var(--on-accent);
    }

    .error {
      margin: 0;
      color: var(--danger);
      font-size: 0.9rem;
    }

    .close {
      flex: none;
      width: 100%;
      background: transparent;
    }
  `,
})
export class StockSheet {
  private readonly productService = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);

  readonly products = input.required<readonly ProductResponse[]>();
  readonly marks = input.required<OutOfStock>();
  /** Every current mark, from the answer. */
  readonly changed = output<StockOutResponse[]>();
  /** A request started or was answered: the page holds its reloads meanwhile. */
  readonly savingChange = output<boolean>();
  /** The backend says what this phone shows is old. */
  readonly conflict = output<void>();
  readonly closed = output<void>();

  /** The variant whose mark is being sent. */
  protected readonly saving = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  constructor() {
    afterNextRender(() => this.closeButton()?.nativeElement.focus());
  }

  protected label(product: ProductResponse, variant: ProductVariantResponse): string {
    return lineLabel({ product, variant });
  }

  /** "Agotado desde 03:30", Chilean time. Without a time (it came with a sale), just the state. */
  protected since(variant: ProductVariantResponse): string {
    const since = this.marks().get(variant.id);
    return since ? `Agotado desde ${formatTime(since)}` : 'Agotado';
  }

  protected toggle(product: ProductResponse, variant: ProductVariantResponse): void {
    if (this.saving() !== null) {
      return;
    }
    this.saving.set(variant.id);
    this.error.set(null);
    this.savingChange.emit(true);
    const request = this.marks().has(variant.id)
      ? this.productService.restock(product.id, variant.id)
      : this.productService.markOutOfStock(product.id, variant.id);
    request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (marks) => {
        this.saving.set(null);
        this.savingChange.emit(false);
        this.changed.emit(marks);
      },
      error: (error: unknown) => {
        this.saving.set(null);
        this.savingChange.emit(false);
        this.error.set(stockErrorMessage(error));
        if (isStockConflict(error)) {
          this.conflict.emit();
        }
      },
    });
  }

  protected close(): void {
    if (this.saving() === null) {
      this.closed.emit();
    }
  }
}
