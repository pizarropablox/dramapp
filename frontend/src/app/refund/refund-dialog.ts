import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { formatClp } from '../shared/clp';
import { CreateRefundRequest, MAX_REFUND_AMOUNT, MAX_REFUND_REASON_LENGTH } from './refund';

/**
 * Bottom sheet recording cash given back from the till, with no sale to pick: by closing time the original
 * one cannot be found. The amount and a reason are required; the confirm button repeats the amount, so the
 * cashier reads what she is about to hand over. "Volver" gets the focus so a stray tap records nothing.
 */
@Component({
  selector: 'app-refund-dialog',
  host: { '(document:keydown.escape)': 'cancel()' },
  template: `
    <div class="backdrop" (click)="cancel()"></div>
    <div
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-title"
      aria-describedby="refund-note"
    >
      <h2 id="refund-title">Devolución de efectivo</h2>
      <p id="refund-note" class="note">Plata que sale de la caja. No cambia Mercado Pago.</p>
      <label class="field amount">
        <span>Monto</span>
        <input
          type="text"
          inputmode="numeric"
          pattern="[0-9]*"
          enterkeyhint="next"
          autocomplete="off"
          maxlength="6"
          placeholder="$0"
          [attr.aria-invalid]="tooHigh()"
          [attr.aria-describedby]="tooHigh() ? 'refund-amount-error' : null"
          [value]="amountText()"
          [disabled]="submitting()"
          (input)="onAmount($event)"
          (keydown.enter)="blur($event)"
        />
      </label>
      @if (tooHigh()) {
        <p id="refund-amount-error" class="invalid">{{ tooHighMessage }}</p>
      }
      <label class="field">
        <span>Motivo</span>
        <input
          type="text"
          enterkeyhint="done"
          autocomplete="off"
          placeholder="Ej.: se acabó el Jack"
          [attr.maxlength]="maxReasonLength"
          [value]="reason()"
          [disabled]="submitting()"
          (input)="onReason($event)"
          (keydown.enter)="blur($event)"
        />
      </label>
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="actions">
        <button #back type="button" class="back" [disabled]="submitting()" (click)="cancel()">
          Volver
        </button>
        <button
          type="button"
          class="confirm"
          [disabled]="submitting() || !valid()"
          (click)="confirm()"
        >
          {{ submitting() ? 'Registrando…' : confirmLabel() }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .backdrop {
      position: fixed;
      inset: 0;
      z-index: 30;
      background: rgb(0 0 0 / 75%);
    }

    .sheet {
      position: fixed;
      inset: auto 0 0;
      z-index: 31;
      display: grid;
      // Never wider than the screen: with larger text the inputs' intrinsic width would widen the column.
      grid-template-columns: minmax(0, 1fr);
      gap: 0.75rem;
      max-width: 30rem;
      max-height: calc(100dvh - var(--update-bar-height));
      overflow-y: auto;
      overscroll-behavior: contain;
      margin: 0 auto;
      padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
      border-top: 2px solid var(--focus);
      border-radius: 1rem 1rem 0 0;
      background: var(--surface);
      box-shadow: 0 -4px 24px rgb(0 0 0 / 50%);
    }

    h2,
    p {
      margin: 0;
    }

    h2 {
      font-size: 1.3rem;
      line-height: 1.25;
    }

    .note {
      color: var(--muted);
    }

    .field {
      display: grid;
      gap: 0.3rem;
      font-size: 0.9rem;
      color: var(--muted);
    }

    input {
      min-width: 0;
      height: 2.75rem;
      padding: 0 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.6rem;
      background: var(--bg);
      color: var(--text);
      font: inherit;
      font-size: 1rem; // >= 16px so iOS Safari does not zoom in on focus
    }

    .amount input {
      height: 3.25rem;
      font-size: 1.4rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }

    .amount input[aria-invalid='true'] {
      border: 2px solid var(--danger);
    }

    .invalid {
      color: var(--danger-text);
      font-weight: 700;
    }

    .error {
      padding: 0.5rem 0.75rem;
      border-radius: 0.6rem;
      background: var(--danger-bg);
      color: var(--danger-text);
    }

    // The confirm button is wider: "Entregar $100.000 de la caja" fits at 375px.
    .actions {
      display: grid;
      grid-template-columns: 1fr 2fr;
      gap: 0.5rem;
    }

    .actions button {
      min-height: 3.25rem;
      font-size: 1.1rem;
      font-weight: 700;
    }

    .confirm {
      border: none;
      background: var(--accent);
      color: var(--on-accent);
    }

    .confirm:disabled {
      opacity: 0.45;
    }
  `,
})
export class RefundDialog {
  readonly submitting = input(false);
  /** Why the last attempt failed (the backend's detail), if it did. */
  readonly error = input<string | null>(null);
  readonly confirmed = output<CreateRefundRequest>();
  readonly cancelled = output<void>();

  protected readonly maxReasonLength = MAX_REFUND_REASON_LENGTH;
  protected readonly tooHighMessage = `La devolución no puede superar ${formatClp(MAX_REFUND_AMOUNT)}.`;
  /** Only digits. */
  protected readonly amountText = signal('');
  protected readonly reason = signal('');
  private readonly amount = computed(() => Number(this.amountText()));
  protected readonly tooHigh = computed(() => this.amount() > MAX_REFUND_AMOUNT);
  private readonly amountValid = computed(() => this.amount() > 0 && !this.tooHigh());
  protected readonly valid = computed(() => this.amountValid() && this.reason().trim() !== '');
  protected readonly confirmLabel = computed(() =>
    this.amountValid() ? `Entregar ${formatClp(this.amount())} de la caja` : 'Entregar de la caja',
  );

  private readonly backButton = viewChild<ElementRef<HTMLButtonElement>>('back');

  constructor() {
    afterNextRender(() => this.backButton()?.nativeElement.focus());
  }

  protected cancel(): void {
    if (!this.submitting()) {
      this.cancelled.emit();
    }
  }

  protected confirm(): void {
    if (this.valid() && !this.submitting()) {
      this.confirmed.emit({ amount: this.amount(), reason: this.reason().trim() });
    }
  }

  /** Only digits: a pasted "$15.000" becomes 15000. */
  protected onAmount(event: Event): void {
    const field = event.target as HTMLInputElement;
    const digits = field.value.replace(/\D/g, '');
    if (digits !== field.value) {
      field.value = digits;
    }
    this.amountText.set(digits);
  }

  protected onReason(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  /** "Listo" on the iPhone keyboard only hides it: recording takes an explicit tap. */
  protected blur(event: Event): void {
    event.preventDefault();
    (event.target as HTMLInputElement).blur();
  }
}
