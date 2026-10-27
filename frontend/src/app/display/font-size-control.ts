import { Component, inject } from '@angular/core';
import { FONT_SIZE_LABELS, FONT_SIZES, FontSizeStore } from './font-size-store';

/** "Tamaño de letra: Normal | Grande | Muy grande". The change shows right away, on every page. */
@Component({
  selector: 'app-font-size-control',
  template: `
    <p id="font-size-label">Tamaño de letra</p>
    <div class="options" role="group" aria-labelledby="font-size-label">
      @for (size of sizes; track size) {
        <button
          type="button"
          [class.selected]="store.size() === size"
          [attr.aria-pressed]="store.size() === size"
          (click)="store.set(size)"
        >
          {{ labels[size] }}
        </button>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.4rem;
    }

    p {
      margin: 0;
    }

    .options {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
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
export class FontSizeControl {
  protected readonly store = inject(FontSizeStore);
  protected readonly sizes = FONT_SIZES;
  protected readonly labels = FONT_SIZE_LABELS;
}
