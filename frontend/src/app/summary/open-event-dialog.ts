import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import {
  form,
  FormField,
  maxLength,
  requiredError,
  submit,
  validate,
} from '@angular/forms/signals';
import { formatEventDate } from '../event/event-date';

export const MAX_EVENT_NAME_LENGTH = 100;

/**
 * Bottom sheet that opens the night's event. The name comes suggested ("DRAMA Octubre") and selected,
 * so typing "Prueba equipo" replaces it at once. The date is computed, only shown.
 */
@Component({
  selector: 'app-open-event-dialog',
  imports: [FormField],
  host: { '(document:keydown.escape)': 'cancel()' },
  template: `
    <div class="backdrop" (click)="cancel()"></div>
    <form
      class="sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="open-event-title"
      novalidate
      (submit)="onSubmit($event)"
    >
      <h2 id="open-event-title">Abrir evento</h2>
      <label class="name">
        <span>Nombre del evento</span>
        <input
          #nameInput
          type="text"
          autocomplete="off"
          enterkeyhint="go"
          [attr.aria-invalid]="nameError() !== null"
          [attr.aria-describedby]="nameError() ? 'event-name-error' : null"
          [formField]="eventForm.name"
          (focus)="nameInput.select()"
        />
      </label>
      @if (nameError(); as message) {
        <p id="event-name-error" class="field-error">{{ message }}</p>
      }
      <p class="date">Fecha: {{ dateLabel() }}</p>
      @if (error(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <div class="actions">
        <button type="button" [disabled]="submitting()" (click)="cancel()">Cancelar</button>
        <button type="submit" class="confirm" [disabled]="submitting()">
          {{ submitting() ? 'Abriendo…' : 'Abrir evento' }}
        </button>
      </div>
    </form>
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
      border-top: 2px solid var(--accent);
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
    }

    .name {
      display: grid;
      gap: 0.35rem;
      color: var(--muted);
      font-size: 0.95rem;
    }

    input {
      height: 3rem;
      padding: 0 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.6rem;
      background: var(--bg);
      color: var(--text);
      font: inherit;
      font-size: 1.1rem; // >= 16px so iOS Safari does not zoom in on focus
    }

    input[aria-invalid='true'] {
      border-color: var(--danger);
    }

    .field-error {
      color: var(--danger);
      font-size: 0.9rem;
    }

    .date {
      color: var(--muted);
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
      background: var(--accent);
      color: var(--on-accent);
    }
  `,
})
export class OpenEventDialog {
  readonly suggestedName = input.required<string>();
  readonly eventDate = input.required<string>();
  readonly submitting = input(false);
  readonly error = input<string | null>(null);

  /** The trimmed name. */
  readonly confirmed = output<string>();
  readonly cancelled = output<void>();

  protected readonly model = linkedSignal(() => ({ name: this.suggestedName() }));
  protected readonly eventForm = form(this.model, (path) => {
    validate(path.name, ({ value }) =>
      value().trim() ? null : requiredError({ message: 'Escribe el nombre del evento.' }),
    );
    maxLength(path.name, MAX_EVENT_NAME_LENGTH, {
      message: `El nombre no puede superar los ${MAX_EVENT_NAME_LENGTH} caracteres.`,
    });
  });
  protected readonly nameError = computed(() => {
    const state = this.eventForm.name();
    return state.touched() ? (state.errors()[0]?.message ?? null) : null;
  });
  protected readonly dateLabel = computed(() => formatEventDate(this.eventDate()));

  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');

  constructor() {
    afterNextRender(() => this.nameInput().nativeElement.focus());
  }

  protected cancel(): void {
    if (!this.submitting()) {
      this.cancelled.emit();
    }
  }

  protected async onSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (this.submitting()) {
      return;
    }
    await submit(this.eventForm, async () => {
      this.confirmed.emit(this.model().name.trim());
      return undefined;
    });
  }
}
