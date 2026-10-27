import {
  afterRenderEffect,
  Component,
  ElementRef,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { lineLabel } from './cart-storage';
import { AddedLine, CartLine } from './cart-store';

@Component({
  selector: 'app-cart-panel',
  template: `
    @if (undoable() && lines().length === 0) {
      <div class="header undo" role="status">
        <span>Carrito vaciado</span>
        <span aria-hidden="true">·</span>
        <button type="button" class="undo-button" (click)="undone.emit()">Deshacer</button>
      </div>
    } @else {
      <!-- "Vaciar" right after the count, far from the − / + column on the right. -->
      <div class="header">
        <button
          type="button"
          class="toggle"
          [attr.aria-expanded]="expanded()"
          aria-controls="cart-lines"
          [disabled]="lines().length === 0"
          (click)="toggle()"
        >
          <span aria-hidden="true">{{ expanded() ? '▾' : '▸' }}</span>
          Carrito ({{ itemCount() }})
        </button>
        @if (lines().length > 0) {
          <span class="separator" aria-hidden="true">·</span>
          <button type="button" class="clear" [disabled]="clearDisabled()" (click)="cleared.emit()">
            Vaciar
          </button>
        }
        <!-- The rest of the row also toggles; the button above is the accessible control. -->
        <span class="toggle-zone" aria-hidden="true" (click)="toggle()"></span>
      </div>
    }
    @if (expanded() && lines().length > 0) {
      <ul #list id="cart-lines" class="lines">
        @for (line of lines(); track line.variant.id) {
          <li class="line" [attr.data-variant-id]="line.variant.id">
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
      align-items: center;
      height: 2rem;
    }

    .header button {
      min-height: 2rem;
      border: none;
      background: transparent;
      font-size: 0.95rem;
    }

    .toggle {
      flex: none;
      padding: 0 0.25rem;
      text-align: left;
      font-weight: 600;
    }

    .separator {
      color: var(--muted);
    }

    .clear,
    .undo-button {
      padding: 0 0.5rem;
      color: var(--accent);
      font-weight: 600;
    }

    .toggle-zone {
      flex: 1;
      align-self: stretch;
      cursor: pointer;
    }

    .undo {
      gap: 0.25rem;
      padding-left: 0.25rem;
      font-size: 0.95rem;
      font-weight: 600;
    }

    // Visible rows depend on the height: 2 (< 720px), 3 (720-879px), 4 (>= 880px).
    // 880 keeps 393x852 phones (iPhone 16) at 3 rows.
    // The dvh cap drops rows when they would leave the product grid under 3 full rows
    // (554px = header 48 + 3 grid rows 248 + rest of the checkout 258, with tip breakdown)
    // or push the checkout over its 55dvh cap (258px of it is not cart lines).
    // Never under 2 rows; more lines scroll, snapping to whole rows so none is cut in half.
    .lines {
      --rows: 2;
      flex: none;
      max-height: 5.5rem; // fallback where round() is unsupported
      max-height: min(
        calc(var(--rows) * 2.75rem),
        max(5.5rem, round(down, min(100dvh - 554px, 55dvh - 258px), 2.75rem))
      );
      overflow-y: auto;
      overscroll-behavior: contain;
      scroll-snap-type: y mandatory;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    @media (min-height: 720px) {
      .lines {
        --rows: 3;
      }
    }

    @media (min-height: 880px) {
      .lines {
        --rows: 4;
      }
    }

    .line {
      scroll-snap-align: start;
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
  /** A sale being sent or possibly registered: only its notice can empty the cart. */
  readonly clearDisabled = input(false);
  /** Just emptied: "Carrito vaciado · Deshacer" replaces the header while the cart stays empty. */
  readonly undoable = input(false);
  readonly undone = output<void>();
  /** Scrolled into view whenever it changes, so the cashier always sees the latest add. */
  readonly lastAdded = input<AddedLine | null>(null);

  private readonly list = viewChild<ElementRef<HTMLElement>>('list');

  constructor() {
    afterRenderEffect(() => {
      const added = this.lastAdded();
      const list = this.list()?.nativeElement;
      if (!added || !list) {
        return;
      }
      list
        .querySelector<HTMLElement>(`[data-variant-id="${added.variantId}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  protected toggle(): void {
    if (this.lines().length > 0) {
      this.expanded.set(!this.expanded());
    }
  }

  protected lineName(line: CartLine): string {
    return lineLabel(line);
  }
}
