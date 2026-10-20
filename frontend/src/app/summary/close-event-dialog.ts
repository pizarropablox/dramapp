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
import { formatDuration } from '../event/event-date';
import { ClpPipe } from '../shared/clp';
import { formatTime } from '../shared/time';

/** "Cerrar evento" stays disabled this long after the sheet opens, so a double tap cannot close. */
export const CLOSE_ARMING_MS = 1500;

/**
 * Confirms closing the event, which cannot be undone and happens once a night, half asleep at 05:30.
 * Shows the name, how long it has been open and what was sold. "Volver" gets the focus; "Cerrar evento"
 * needs the "Sí, terminó la fiesta" box ticked and is disabled for the first 1.5 s.
 */
@Component({
  selector: 'app-close-event-dialog',
  imports: [ClpPipe],
  host: { '(document:keydown.escape)': 'cancel()' },
  template: `
    <div class="backdrop" (click)="cancel()"></div>
    <div
      class="sheet"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="close-event-title"
      aria-describedby="close-event-summary close-event-warning"
    >
      <h2 id="close-event-title">¿Realmente deseas cerrar "{{ eventName() }}"?</h2>
      <div id="close-event-summary" class="summary">
        <p class="opened">Abierto desde {{ openedTime() }} (hace {{ openFor() }})</p>
        <p class="sold">
          <span>Total vendido</span>
          <strong>{{ total() | clp }}</strong>
        </p>
        <p class="count">{{ salesCount() }} {{ salesCount() === 1 ? 'venta' : 'ventas' }}</p>
      </div>
      <p id="close-event-warning" class="warning">
        Después de cerrar no se pueden registrar ni anular ventas, y el evento no se puede reabrir.
      </p>
      <label class="ack">
        <input
          type="checkbox"
          [checked]="acknowledged()"
          [disabled]="submitting()"
          (change)="onAcknowledge($event)"
        />
        <span>Sí, terminó la fiesta</span>
      </label>
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="actions">
        <button #back type="button" class="back" [disabled]="submitting()" (click)="cancel()">
          Volver
        </button>
        <button type="button" class="confirm" [disabled]="!canConfirm()" (click)="confirm()">
          {{ submitting() ? 'Cerrando…' : 'Cerrar evento' }}
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
      max-height: 100dvh;
      margin: 0 auto;
      padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom));
      overflow-y: auto;
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
      overflow-wrap: anywhere;
    }

    .summary {
      display: grid;
      gap: 0.2rem;
      padding: 0.6rem 0.8rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: var(--bg);
    }

    .opened,
    .count {
      color: var(--muted);
      font-size: 0.95rem;
    }

    .sold {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
      font-weight: 600;
    }

    .sold strong {
      font-size: 1.8rem;
      white-space: nowrap;
    }

    .warning {
      padding: 0.6rem 0.75rem;
      border-left: 4px solid var(--danger);
      border-radius: 0.5rem;
      background: var(--danger-bg);
      color: var(--danger-text);
      font-weight: 700;
    }

    // The whole row is the tap target (>= 52px high), not just the small native box.
    .ack {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      min-height: 3.25rem;
      padding: 0 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: var(--surface-2);
      font-size: 1.1rem;
      font-weight: 600;
      cursor: pointer;
    }

    .ack input {
      flex: none;
      width: 1.6rem;
      height: 1.6rem;
      margin: 0;
      accent-color: var(--danger);
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
export class CloseEventDialog {
  readonly eventName = input.required<string>();
  readonly openedAt = input.required<string>();
  /** What was charged: products + tips, voided sales excluded. */
  readonly total = input.required<number>();
  readonly salesCount = input.required<number>();
  readonly submitting = input(false);
  readonly error = input<string | null>(null);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected readonly acknowledged = signal(false);
  private readonly armed = signal(false);
  private readonly now = signal(Date.now());

  protected readonly openedTime = computed(() => formatTime(this.openedAt()));
  protected readonly openFor = computed(() =>
    formatDuration(this.now() - Date.parse(this.openedAt())),
  );
  protected readonly canConfirm = computed(
    () => this.armed() && this.acknowledged() && !this.submitting(),
  );

  private readonly back = viewChild.required<ElementRef<HTMLButtonElement>>('back');

  constructor() {
    afterNextRender(() => this.back().nativeElement.focus());
    const arming = setTimeout(() => this.armed.set(true), CLOSE_ARMING_MS);
    const clock = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(arming);
      clearInterval(clock);
    });
  }

  protected onAcknowledge(event: Event): void {
    this.acknowledged.set((event.target as HTMLInputElement).checked);
  }

  protected cancel(): void {
    if (!this.submitting()) {
      this.cancelled.emit();
    }
  }

  protected confirm(): void {
    if (this.canConfirm()) {
      this.confirmed.emit();
    }
  }
}
