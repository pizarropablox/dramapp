import { Component, input, model, output } from '@angular/core';
import { ClpPipe } from '../shared/clp';
import { PAYMENT_METHOD_LABELS, PaymentMethod } from './sale';

@Component({
  selector: 'app-checkout-bar',
  imports: [ClpPipe],
  template: `
    <div class="summary">
      <div class="notes">
        @if (savings() > 0) {
          <p class="savings">Ahorro por promo: {{ savings() | clp }}</p>
        }
        @if (hint()) {
          <p class="hint" id="confirm-hint">{{ hint() }}</p>
        }
      </div>
      <p class="total" aria-live="polite">
        <span class="total-label">Total</span>
        <strong>{{ total() | clp }}</strong>
      </p>
    </div>
    <div class="methods" role="group" aria-label="Medio de pago">
      @for (method of methods; track method) {
        <button
          type="button"
          class="method"
          [class.selected]="paymentMethod() === method"
          [attr.aria-pressed]="paymentMethod() === method"
          [disabled]="submitting()"
          (click)="paymentMethod.set(method)"
        >
          {{ labels[method] }}
        </button>
      }
    </div>
    <button
      type="button"
      class="confirm"
      [disabled]="!canConfirm()"
      [attr.aria-describedby]="hint() ? 'confirm-hint' : null"
      (click)="confirmed.emit()"
    >
      {{ submitting() ? 'Registrando…' : 'Confirmar venta' }}
    </button>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.375rem;
    }

    p {
      margin: 0;
    }

    /* Savings / hint (small, left) and total (big, right) share one row. */
    .summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .notes {
      flex: 1;
      min-width: 0;
      font-size: 0.8rem;
      line-height: 1.25;
    }

    .savings {
      color: var(--success);
      font-weight: 600;
    }

    .hint {
      color: var(--muted);
    }

    .total {
      display: flex;
      flex: none;
      align-items: baseline;
      gap: 0.4rem;
    }

    .total-label {
      font-size: 0.9rem;
      color: var(--muted);
    }

    .total strong {
      font-size: 1.9rem;
      line-height: 1.1;
    }

    .methods {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }

    .method {
      height: 3rem;
      font-size: 1.05rem;
      font-weight: 600;
    }

    .method.selected {
      border: 3px solid var(--accent);
      background: var(--accent);
      color: var(--on-accent);
    }

    .confirm {
      height: 3.5rem;
      border: none;
      background: var(--success);
      color: var(--on-success);
      font-size: 1.2rem;
      font-weight: 700;
    }

    /* Clearly inactive: grey, not a faded green. */
    .confirm:disabled {
      border: 1px dashed var(--border);
      background: var(--surface-2);
      color: var(--muted);
      opacity: 1;
    }
  `,
})
export class CheckoutBar {
  readonly total = input.required<number>();
  readonly savings = input.required<number>();
  readonly paymentMethod = model<PaymentMethod | null>(null);
  readonly canConfirm = input.required<boolean>();
  readonly submitting = input(false);
  /** Why the sale cannot be confirmed yet, if anything. */
  readonly hint = input<string | null>(null);
  readonly confirmed = output<void>();

  protected readonly methods: readonly PaymentMethod[] = ['MERCADO_PAGO', 'EFECTIVO'];
  protected readonly labels = PAYMENT_METHOD_LABELS;
}
