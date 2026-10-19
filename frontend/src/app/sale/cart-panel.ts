import { Component, input, model, output } from '@angular/core';
import { CartLine } from './cart-store';

@Component({
  selector: 'app-cart-panel',
  template: `
    <div class="header">
      <button
        type="button"
        class="toggle"
        [attr.aria-expanded]="expanded()"
        aria-controls="cart-lines"
        [disabled]="lines().length === 0"
        (click)="expanded.set(!expanded())"
      >
        <span aria-hidden="true">{{ expanded() ? '▾' : '▸' }}</span>
        Carrito ({{ itemCount() }})
      </button>
      @if (lines().length > 0) {
        <button type="button" class="clear" (click)="cleared.emit()">Vaciar</button>
      }
    </div>
    @if (expanded() && lines().length > 0) {
      <ul id="cart-lines" class="lines">
        @for (line of lines(); track line.variant.id) {
          <li class="line">
            <span class="label">
              {{ line.product.name }}
              @if (line.product.variants.length > 1) {
                <span class="variant">· {{ line.variant.name }}</span>
              }
            </span>
            <span class="stepper">
              <button
                type="button"
                [attr.aria-label]="'Quitar uno de ' + lineName(line)"
                (click)="decremented.emit(line.variant.id)"
              >
                −
              </button>
              <span class="quantity" aria-live="polite">{{ line.quantity }}</span>
              <button
                type="button"
                [attr.aria-label]="'Agregar uno de ' + lineName(line)"
                (click)="incremented.emit(line.variant.id)"
              >
                +
              </button>
            </span>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    // Column flex so the line list can shrink when the checkout panel runs out of space.
    :host {
      display: flex;
      flex-direction: column;
      min-height: 0;
    }

    .header {
      display: flex;
      flex: none;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .header button {
      min-height: 2rem;
      border: none;
      background: transparent;
      font-size: 0.95rem;
    }

    .toggle {
      flex: 1;
      padding: 0 0.25rem;
      text-align: left;
      font-weight: 600;
    }

    .clear {
      padding: 0 0.5rem;
      color: var(--accent);
    }

    // At most 2.5 rows (so it shows there is more to scroll), never less than 1.
    .lines {
      flex: 0 1 auto;
      min-height: 2.75rem;
      max-height: 6.875rem;
      overflow-y: auto;
      overscroll-behavior: contain;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .line {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
      height: 2.75rem;
      border-bottom: 1px solid var(--border);
    }

    .label {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      font-weight: 600;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .variant {
      font-weight: 400;
      color: var(--muted);
    }

    .stepper {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex: none;
    }

    .stepper button {
      width: 2.5rem;
      min-width: 2.5rem;
      height: 2.5rem;
      min-height: 2.5rem;
      padding: 0;
      font-size: 1.3rem;
      line-height: 1;
    }

    .quantity {
      min-width: 1.75rem;
      text-align: center;
      font-weight: 700;
      font-size: 1.05rem;
    }
  `,
})
export class CartPanel {
  readonly lines = input.required<readonly CartLine[]>();
  readonly itemCount = input.required<number>();
  readonly expanded = model(true);
  readonly incremented = output<number>();
  readonly decremented = output<number>();
  readonly cleared = output<void>();

  protected lineName(line: CartLine): string {
    return line.product.variants.length > 1
      ? `${line.product.name} ${line.variant.name}`
      : line.product.name;
  }
}
