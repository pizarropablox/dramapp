import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  output,
  viewChild,
} from '@angular/core';
import { formatClp } from '../shared/clp';
import { formatTime } from '../shared/time';
import { RefundResponse } from './refund';

/**
 * Bottom sheet confirming the void of a refund entered by mistake, which cannot be undone.
 * "Volver" gets the focus so a stray tap does not void.
 */
@Component({
  selector: 'app-void-refund-dialog',
  host: { '(document:keydown.escape)': 'cancel()' },
  template: `
    <div class="backdrop" (click)="cancel()"></div>
    <div
      class="sheet"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="void-refund-title"
      aria-describedby="void-refund-summary void-refund-help"
    >
      <h2 id="void-refund-title">{{ question() }}</h2>
      <p id="void-refund-summary" class="summary">{{ time() }} · Motivo: {{ refund().reason }}</p>
      <p id="void-refund-help" class="help">Solo si se ingresó mal.</p>
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="actions">
        <button #back type="button" class="back" [disabled]="submitting()" (click)="cancel()">
          Volver
        </button>
        <button type="button" class="confirm" [disabled]="submitting()" (click)="confirmed.emit()">
          {{ submitting() ? 'Anulando…' : 'Anular devolución' }}
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
      overflow-wrap: anywhere;
    }

    .help {
      color: var(--muted);
      font-size: 0.9rem;
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
export class VoidRefundDialog {
  readonly refund = input.required<RefundResponse>();
  readonly submitting = input(false);
  /** Why the last attempt failed (the backend's detail), if it did. */
  readonly error = input<string | null>(null);
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly question = computed(
    () => `¿Anular devolución de ${formatClp(this.refund().amount)}?`,
  );
  protected readonly time = computed(() => formatTime(this.refund().createdAt));

  private readonly backButton = viewChild<ElementRef<HTMLButtonElement>>('back');

  constructor() {
    afterNextRender(() => this.backButton()?.nativeElement.focus());
  }

  protected cancel(): void {
    if (!this.submitting()) {
      this.cancelled.emit();
    }
  }
}
