import { Component, computed, input, output } from '@angular/core';
import { formatClp } from '../shared/clp';
import { formatTime } from '../shared/time';
import { PendingSale } from './cart-storage';
import { PAYMENT_METHOD_LABELS } from './sale';

/**
 * A sale was sent but no answer came (no connection, timeout, 5xx, or the page reloaded meanwhile): it
 * may have been registered. Confirming stays blocked until the cashier checks "Últimas ventas" and says
 * whether it is there. Takes the place of the tip and payment buttons (both unusable meanwhile), so the
 * cart and the confirm button stay in view on a 375px-wide phone.
 */
@Component({
  selector: 'app-pending-sale-notice',
  host: { role: 'alert' },
  template: `
    <p>
      <strong>⚠ Esta venta pudo haberse registrado</strong> ({{ details() }}). Revisa Últimas
      ventas.
      @if (smart()) {
        <strong>Ya está: anúlala en Ventas y confírmala de nuevo.</strong>
      }
    </p>
    <div class="actions" [class.two]="smart()">
      <button type="button" (click)="review.emit()">Ver ventas</button>
      @if (smart()) {
        <button type="button" class="continue" (click)="notRegistered.emit()">
          Anulada o no está: seguir
        </button>
      } @else {
        <button type="button" (click)="registered.emit()">Ya está: vaciar</button>
        <button type="button" class="continue" (click)="notRegistered.emit()">
          No está: seguir
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.375rem;
      padding: 0.4rem 0.5rem 0.5rem;
      border: 2px solid var(--focus);
      border-radius: 0.6rem;
      background: var(--surface);
    }

    // 2 lines at 375px, so the notice fits where the tip and payment rows were.
    p {
      margin: 0;
      font-size: 0.8rem;
      line-height: 1.25;
    }

    .actions {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0.375rem;
    }

    .two {
      grid-template-columns: 1fr 2fr;
    }

    button {
      min-width: 0;
      min-height: 0;
      height: 2.75rem;
      padding: 0 0.25rem;
      font-size: 0.85rem;
      font-weight: 600;
      line-height: 1.1;
    }

    .continue {
      border-color: var(--accent);
    }
  `,
})
export class PendingSaleNotice {
  readonly pending = input.required<PendingSale>();
  /**
   * This phone charges with a Point Smart: a sale that was registered without an answer was never sent to it, nor
   * its vale printed. Emptying the cart would leave it uncharged, so it is voided and confirmed again.
   */
  readonly smart = input(false);
  /** "Ver ventas": opens Últimas ventas to look for it. */
  readonly review = output<void>();
  /** "Ya está: vaciar": it was registered, start a new sale. */
  readonly registered = output<void>();
  /** "No está: seguir": it was not, so it can be confirmed again. */
  readonly notRegistered = output<void>();

  /** "23:15 · Mercado Pago · $12.000". */
  protected readonly details = computed(() => {
    const pending = this.pending();
    return [
      formatTime(new Date(pending.startedAt).toISOString()),
      PAYMENT_METHOD_LABELS[pending.paymentMethod],
      formatClp(pending.amountToCharge),
    ].join(' · ');
  });
}
