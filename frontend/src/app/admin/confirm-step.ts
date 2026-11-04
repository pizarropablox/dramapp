import { afterNextRender, Component, ElementRef, input, output, viewChild } from '@angular/core';

/**
 * The last step before adding something to the menu, which cannot be deleted afterwards, editing it, deactivating
 * it or reactivating it: what will be saved (projected), the warning, and "Volver" / "Sí, agregar". The title takes
 * the focus, so a screen reader starts here.
 */
@Component({
  selector: 'app-confirm-step',
  template: `
    <section class="confirm" aria-labelledby="confirm-title">
      <h2 id="confirm-title" tabindex="-1" #title>{{ heading() }}</h2>
      <ng-content />
      <p class="warning">{{ warning() }}</p>
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="actions">
        <button type="button" class="back-button" [disabled]="submitting()" (click)="back.emit()">
          Volver
        </button>
        <button
          type="button"
          class="confirm-button"
          [disabled]="submitting()"
          (click)="confirmed.emit()"
        >
          {{ submitting() ? submittingLabel() : confirmLabel() }}
        </button>
      </div>
    </section>
  `,
  styles: `
    .confirm {
      display: grid;
      gap: 0.9rem;
    }

    h2 {
      margin: 0;
      font-size: 1.2rem;
    }

    h2:focus {
      outline: none;
    }

    p {
      margin: 0;
    }

    .warning {
      padding: 0.6rem 0.75rem;
      border-left: 4px solid var(--accent);
      border-radius: 0.5rem;
      background: var(--surface-2);
      font-weight: 700;
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

    :host-context([data-font-size='xlarge']) .actions {
      grid-template-columns: 1fr;
    }

    .actions button {
      min-height: 3.25rem;
      font-size: 1.1rem;
      font-weight: 700;
    }

    .confirm-button {
      border: none;
      background: var(--accent);
      color: var(--on-accent);
    }
  `,
})
export class ConfirmStep {
  readonly heading = input.required<string>();
  readonly warning = input.required<string>();
  readonly confirmLabel = input('Sí, agregar');
  readonly submittingLabel = input('Agregando…');
  readonly submitting = input(false);
  readonly error = input<string | null>(null);

  readonly back = output<void>();
  readonly confirmed = output<void>();

  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  constructor() {
    afterNextRender(() => this.title().nativeElement.focus());
  }
}
