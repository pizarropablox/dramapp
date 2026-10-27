import { Component, computed, input, model } from '@angular/core';
import { ClpPipe } from '../shared/clp';
import { MAX_TIP } from './sale';

/** The tip being charged with the sale. custom: typed in "Otro" rather than a quick button. */
export interface TipChoice {
  amount: number;
  custom: boolean;
}

export const NO_TIP: TipChoice = { amount: 0, custom: false };

/**
 * One compact row (44px): "Sin propina", quick amounts and "Otro" (two rows with "Muy grande" text).
 * "Otro" is the numeric input itself, so tapping it opens the iPhone keypad right away
 * (iOS only shows the keyboard when focus happens inside the tap).
 */
@Component({
  selector: 'app-tip-selector',
  imports: [ClpPipe],
  host: { role: 'group', 'aria-label': 'Propina' },
  template: `
    <button
      type="button"
      [class.selected]="none()"
      [attr.aria-pressed]="none()"
      [disabled]="disabled()"
      (click)="tip.set(noTip)"
    >
      Sin propina
    </button>
    @for (amount of presets; track amount) {
      <button
        type="button"
        [class.selected]="isPreset(amount)"
        [attr.aria-pressed]="isPreset(amount)"
        [attr.aria-label]="'Propina ' + (amount | clp)"
        [disabled]="disabled()"
        (click)="tip.set({ amount, custom: false })"
      >
        {{ amount | clp }}
      </button>
    }
    <input
      type="text"
      inputmode="numeric"
      pattern="[0-9]*"
      enterkeyhint="done"
      autocomplete="off"
      maxlength="6"
      placeholder="Otro"
      aria-label="Propina, otro monto"
      [class.selected]="tip().custom"
      [attr.aria-invalid]="tooHigh()"
      [value]="tip().custom ? tip().amount || '' : ''"
      [disabled]="disabled()"
      (focus)="startCustom()"
      (input)="onCustomInput($event)"
      (blur)="endCustom()"
    />
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1.6fr repeat(4, 1fr);
      gap: 0.375rem;
    }

    // "Muy grande": "Sin propina" and "$2.000" no longer fit in one row at 375px. Two rows: the amounts
    // on top, "Sin propina" and "Otro" below.
    :host-context([data-font-size='xlarge']) {
      grid-template-columns: repeat(6, minmax(0, 1fr));

      > * {
        grid-column: span 2;
      }

      > :first-child {
        grid-area: 2 / 1 / 3 / 4;
      }

      > input {
        grid-area: 2 / 4 / 3 / 7;
      }

      // Still >= 48px to tap; the second row costs less height.
      > button,
      > input {
        height: 2.5rem;
      }
    }

    button,
    input {
      min-width: 0;
      min-height: 0;
      height: 2.75rem;
      padding: 0 0.25rem;
      border-radius: 0.6rem;
      font-weight: 600;
    }

    button {
      font-size: 0.85rem;
      white-space: nowrap;
    }

    button.selected {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--on-accent);
    }

    input {
      width: 100%;
      border: 1px solid var(--border);
      background: var(--surface-2);
      color: var(--text);
      font: inherit;
      font-size: 1rem; // >= 16px so iOS Safari does not zoom in on focus
      font-weight: 600;
      text-align: center;
    }

    input::placeholder {
      color: var(--text);
      opacity: 1;
    }

    input.selected {
      border: 2px solid var(--accent);
    }

    input:disabled {
      opacity: 0.45;
    }
  `,
})
export class TipSelector {
  readonly tip = model<TipChoice>(NO_TIP);
  readonly disabled = input(false);

  protected readonly noTip = NO_TIP;
  protected readonly presets: readonly number[] = [500, 1000, 2000];

  protected readonly none = computed(() => !this.tip().custom && this.tip().amount === 0);
  protected readonly tooHigh = computed(() => this.tip().amount > MAX_TIP);

  protected isPreset(amount: number): boolean {
    return !this.tip().custom && this.tip().amount === amount;
  }

  protected startCustom(): void {
    if (!this.tip().custom) {
      this.tip.set({ amount: 0, custom: true });
    }
  }

  protected onCustomInput(event: Event): void {
    const field = event.target as HTMLInputElement;
    const digits = field.value.replace(/\D/g, '');
    if (digits !== field.value) {
      field.value = digits;
    }
    this.tip.set({ amount: digits ? Number(digits) : 0, custom: true });
  }

  /** Leaving "Otro" empty goes back to "Sin propina". */
  protected endCustom(): void {
    if (this.tip().custom && this.tip().amount === 0) {
      this.tip.set(NO_TIP);
    }
  }
}
