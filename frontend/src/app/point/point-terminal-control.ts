import { Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { PointTerminal } from './point';
import { PointTerminalStore } from './point-terminal-store';
import { PointService } from './point.service';

/**
 * "Cobrar Mercado Pago con: Point Mini | Smart 1". The list comes from the backend; if it cannot be loaded, what
 * was chosen stays. Not shown while there is nothing to choose (the Point is off, or an older backend).
 */
@Component({
  selector: 'app-point-terminal-control',
  template: `
    @if (terminals().length > 0) {
      <p id="point-terminal-label">Cobrar Mercado Pago con</p>
      <div class="options" role="group" aria-labelledby="point-terminal-label">
        <button
          type="button"
          [class.selected]="!store.terminal()"
          [attr.aria-pressed]="!store.terminal()"
          (click)="store.set(null)"
        >
          Point Mini
        </button>
        @for (terminal of terminals(); track terminal.id) {
          <button
            type="button"
            [class.selected]="store.terminal()?.id === terminal.id"
            [attr.aria-pressed]="store.terminal()?.id === terminal.id"
            (click)="store.set(terminal)"
          >
            {{ terminal.name }}
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.4rem;
    }

    :host:empty {
      display: none;
    }

    p {
      margin: 0;
    }

    .options {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
      gap: 0.5rem;
    }

    button {
      min-width: 0;
      padding: 0 0.25rem;
      font-weight: 600;
    }

    .selected {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--on-accent);
    }
  `,
})
export class PointTerminalControl {
  private readonly pointService = inject(PointService);
  protected readonly store = inject(PointTerminalStore);

  private readonly list = rxResource({ stream: () => this.pointService.terminals() });

  /** The chosen one stays on the list even if the backend no longer has it, so it can be seen and changed. */
  protected readonly terminals = computed<readonly PointTerminal[]>(() => {
    const known = this.list.hasValue() ? this.list.value() : [];
    const chosen = this.store.terminal();
    return !chosen || known.some((terminal) => terminal.id === chosen.id)
      ? known
      : [...known, chosen];
  });
}
