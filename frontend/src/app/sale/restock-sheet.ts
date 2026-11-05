import {
  afterNextRender,
  Component,
  computed,
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
import { lineLabel } from './cart-storage';
import { isStockConflict, stockErrorMessage } from './stock';

/**
 * Tapping something grey: more came, or another phone already unmarked it and this one has not heard. Unmarking is
 * safe to repeat. It does not add to the cart: that takes one more tap. It stays open until answered, like the
 * «Agotados» sheet. A second tap of a quick double tap lands on the backdrop, not on the button.
 */
@Component({
  selector: 'app-restock-sheet',
  host: { '(document:keydown.escape)': 'cancel()' },
  template: `
    <div class="backdrop" (click)="cancel()"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="restock-sheet-title">
      <h2 id="restock-sheet-title">{{ label() }} está agotado</h2>
      <p class="question">¿Llegó más?</p>
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <button type="button" class="restock" [disabled]="saving()" (click)="restock()">
        {{ saving() ? 'Guardando…' : 'Sí, llegó más' }}
      </button>
      <button #cancelButton type="button" class="cancel" [disabled]="saving()" (click)="cancel()">
        Cancelar
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

    .sheet {
      position: fixed;
      inset: auto 0 0;
      z-index: 11;
      display: grid;
      gap: 0.5rem;
      padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
      border-radius: 1rem 1rem 0 0;
      background: var(--surface);
      box-shadow: 0 -4px 24px rgb(0 0 0 / 50%);
    }

    h2 {
      margin: 0;
      font-size: 1.25rem;
    }

    .question {
      margin: 0;
      color: var(--muted);
    }

    .error {
      margin: 0;
      color: var(--danger);
      font-size: 0.9rem;
    }

    .restock {
      min-height: 3.5rem;
      border-color: var(--accent);
      background: var(--accent);
      color: var(--on-accent);
      font-size: 1.15rem;
      font-weight: 600;
    }

    .cancel {
      background: transparent;
    }
  `,
})
export class RestockSheet {
  private readonly productService = inject(ProductService);
  private readonly destroyRef = inject(DestroyRef);

  readonly product = input.required<ProductResponse>();
  readonly variant = input.required<ProductVariantResponse>();
  /** Every current mark, from the answer. */
  readonly restocked = output<StockOutResponse[]>();
  /** A request started or was answered: the page holds its reloads meanwhile. */
  readonly savingChange = output<boolean>();
  /** The backend says what this phone shows is old. */
  readonly conflict = output<void>();
  readonly cancelled = output<void>();

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly label = computed(() =>
    lineLabel({ product: this.product(), variant: this.variant() }),
  );

  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');

  constructor() {
    afterNextRender(() => this.cancelButton()?.nativeElement.focus());
  }

  protected restock(): void {
    if (this.saving()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    this.savingChange.emit(true);
    this.productService
      .restock(this.product().id, this.variant().id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (marks) => {
          this.saving.set(false);
          this.savingChange.emit(false);
          this.restocked.emit(marks);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.savingChange.emit(false);
          this.error.set(stockErrorMessage(error));
          if (isStockConflict(error)) {
            this.conflict.emit();
          }
        },
      });
  }

  protected cancel(): void {
    if (!this.saving()) {
      this.cancelled.emit();
    }
  }
}
