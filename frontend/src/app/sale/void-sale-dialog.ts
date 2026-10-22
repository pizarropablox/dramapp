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
import { formatTime } from '../shared/time';
import { MAX_VOID_REASON_LENGTH, SaleResponse } from './sale';
import { saleSummary, voidQuestion } from './sale-format';

/**
 * Bottom sheet confirming a void, which cannot be undone. "Volver" gets the focus so a stray tap
 * does not void; "Anular venta" sits on the right, under the thumb, once the cashier has read it.
 * Voiding means the sale never happened (card declined, mistyped sale): no money moves. Cash given
 * back is a separate refund ("Devolución", in the latest sales).
 */
@Component({
  selector: 'app-void-sale-dialog',
  host: { '(document:keydown.escape)': 'cancel()' },
  template: `
    <div class="backdrop" (click)="cancel()"></div>
    <div
      class="sheet"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="void-sale-title"
      aria-describedby="void-sale-summary void-sale-help"
    >
      <h2 id="void-sale-title">{{ question() }}</h2>
      <p id="void-sale-summary" class="summary">{{ time() }} · {{ summary() }}</p>
      <label class="reason">
        <span>Motivo (opcional)</span>
        <input
          type="text"
          enterkeyhint="done"
          autocomplete="off"
          placeholder="Ej.: monto mal digitado"
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
      <p id="void-sale-help" class="help">¿Hay que devolver plata? Usa Devolución</p>
      <div class="actions">
        <button #back type="button" class="back" [disabled]="submitting()" (click)="cancel()">
          Volver
        </button>
        <button
          type="button"
          class="confirm"
          [disabled]="submitting()"
          (click)="confirmed.emit(reason())"
        >
          {{ submitting() ? 'Anulando…' : 'Anular venta' }}
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
      gap: 0.75rem;
      max-width: 30rem;
      margin: 0 auto;
      padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
      border-top: 2px solid var(--danger);
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

    .summary {
      color: var(--muted);
    }

    .help {
      color: var(--muted);
      font-size: 0.9rem;
    }

    .reason {
      display: grid;
      gap: 0.3rem;
      font-size: 0.9rem;
      color: var(--muted);
    }

    input {
      height: 2.75rem;
      padding: 0 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.6rem;
      background: var(--bg);
      color: var(--text);
      font: inherit;
      font-size: 1rem; // >= 16px so iOS Safari does not zoom in on focus
    }

    .error {
      padding: 0.5rem 0.75rem;
      border-radius: 0.6rem;
      background: var(--danger-bg);
      color: var(--danger-text);
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.5rem;
    }

    .actions button {
      min-height: 3.25rem;
      font-size: 1.1rem;
      font-weight: 700;
    }

    .confirm {
      border: none;
      background: var(--danger);
      color: var(--on-danger);
    }
  `,
})
export class VoidSaleDialog {
  readonly sale = input.required<SaleResponse>();
  readonly submitting = input(false);
  /** Why the last attempt failed (the backend's detail), if it did. */
  readonly error = input<string | null>(null);
  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  protected readonly maxReasonLength = MAX_VOID_REASON_LENGTH;
  protected readonly reason = signal('');
  protected readonly question = computed(() => voidQuestion(this.sale()));
  protected readonly time = computed(() => formatTime(this.sale().createdAt));
  protected readonly summary = computed(() => saleSummary(this.sale().lines));

  private readonly backButton = viewChild<ElementRef<HTMLButtonElement>>('back');

  constructor() {
    afterNextRender(() => this.backButton()?.nativeElement.focus());
  }

  protected cancel(): void {
    if (!this.submitting()) {
      this.cancelled.emit();
    }
  }

  protected onReason(event: Event): void {
    this.reason.set((event.target as HTMLInputElement).value);
  }

  /** "Listo" on the iPhone keyboard only hides it: voiding takes an explicit tap. */
  protected blur(event: Event): void {
    event.preventDefault();
    (event.target as HTMLInputElement).blur();
  }
}
