import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { ClpPipe } from '../shared/clp';
import { PAYMENT_METHOD_LABELS, SaleResponse } from './sale';

/** Shows the amount to charge (from the backend) until the cashier moves on to the next sale. */
@Component({
  selector: 'app-sale-confirmation',
  imports: [ClpPipe],
  template: `
    <div class="backdrop"></div>
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="sale-confirmation-title"
      aria-describedby="sale-confirmation-amount"
    >
      <h2 id="sale-confirmation-title">Venta registrada</h2>
      <p id="sale-confirmation-amount" class="amount">
        <span>Cobrar</span>
        <strong>{{ sale().total | clp }}</strong>
        <span class="method">{{ labels[sale().paymentMethod] }}</span>
      </p>
      <button #next type="button" class="next" (click)="nextSale.emit()">Siguiente venta</button>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 20;
      background: rgb(0 0 0 / 70%);
    }

    .dialog {
      position: fixed;
      inset: auto 0.75rem calc(0.75rem + env(safe-area-inset-bottom));
      z-index: 21;
      padding: 1.25rem;
      border-radius: 1rem;
      background: var(--surface);
      border: 2px solid var(--success);
      text-align: center;
    }

    h2 {
      margin: 0;
      color: var(--success);
    }

    .amount {
      display: grid;
      gap: 0.25rem;
      margin: 1rem 0 1.25rem;
      font-size: 1.1rem;
    }

    .amount strong {
      font-size: 3rem;
      line-height: 1.1;
    }

    .method {
      font-weight: 600;
    }

    .next {
      width: 100%;
      min-height: 3.5rem;
      border: none;
      background: var(--success);
      color: var(--on-success);
      font-size: 1.25rem;
      font-weight: 700;
    }
  `,
})
export class SaleConfirmation {
  readonly sale = input.required<SaleResponse>();
  readonly nextSale = output<void>();

  protected readonly labels = PAYMENT_METHOD_LABELS;

  private readonly nextButton = viewChild<ElementRef<HTMLButtonElement>>('next');

  constructor() {
    afterNextRender(() => this.nextButton()?.nativeElement.focus());
  }
}
