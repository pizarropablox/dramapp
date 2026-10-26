import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CartStore } from '../sale/cart-store';
import { AppUpdates } from './app-updates';

/** Set on <html> while the bar shows: the pages stop adding the notch inset, the bar already covers it. */
export const UPDATE_BAR_VISIBLE_CLASS = 'update-bar-visible';
/** The bar's height, so the page below starts under it (see styles.scss). */
export const UPDATE_BAR_HEIGHT_VAR = '--update-bar-height';

/**
 * "Hay una versión nueva · Actualizar", pinned on top and pushing the page down, never over the sale
 * buttons at the bottom. With products in the cart it asks first: the saved cart comes back after the
 * reload (see cart-storage.ts), but updating in the middle of a sale is still better avoided.
 */
@Component({
  selector: 'app-update-banner',
  template: `
    @if (updates.available()) {
      <div #bar class="update-bar" role="status">
        @if (confirming()) {
          <p>
            Hay un pedido en curso ({{ itemCount() }}
            {{ itemCount() === 1 ? 'producto' : 'productos' }}). Mejor termina la venta primero, o:
          </p>
          <div class="actions">
            <button type="button" (click)="confirming.set(false)">Volver</button>
            <button type="button" class="update" (click)="apply()">Actualizar igual</button>
          </div>
        } @else {
          <p>
            {{
              updates.state() === 'broken' ? 'La app necesita recargarse' : 'Hay una versión nueva'
            }}
          </p>
          <div class="actions">
            <button type="button" class="update" (click)="update()">Actualizar</button>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .update-bar {
      position: fixed;
      inset: 0 0 auto;
      z-index: 40;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.25rem 0.5rem;
      padding: calc(0.25rem + env(safe-area-inset-top)) 0.75rem 0.25rem;
      border-bottom: 2px solid var(--accent);
      background: var(--surface-2);
      font-size: 0.95rem;
    }

    p {
      flex: 1 1 10rem;
      margin: 0;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
      margin-left: auto;
    }

    button {
      min-height: 2.75rem;
      padding: 0 0.75rem;
      font-weight: 700;
    }

    .update {
      border: none;
      background: var(--accent);
      color: var(--on-accent);
    }
  `,
})
export class UpdateBanner {
  protected readonly updates = inject(AppUpdates);
  private readonly cart = inject(CartStore);
  private readonly document = inject(DOCUMENT);

  protected readonly confirming = signal(false);
  protected readonly itemCount = computed(() => this.cart.itemCount());

  private readonly bar = viewChild<ElementRef<HTMLElement>>('bar');

  constructor() {
    const root = this.document.documentElement;
    let observer: ResizeObserver | undefined;
    afterRenderEffect(() => {
      const bar = this.bar()?.nativeElement;
      observer?.disconnect();
      if (!bar) {
        root.classList.remove(UPDATE_BAR_VISIBLE_CLASS);
        root.style.removeProperty(UPDATE_BAR_HEIGHT_VAR);
        return;
      }
      root.classList.add(UPDATE_BAR_VISIBLE_CLASS);
      const measure = () => root.style.setProperty(UPDATE_BAR_HEIGHT_VAR, `${bar.offsetHeight}px`);
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(bar);
      }
    });
    inject(DestroyRef).onDestroy(() => {
      observer?.disconnect();
      root.classList.remove(UPDATE_BAR_VISIBLE_CLASS);
      root.style.removeProperty(UPDATE_BAR_HEIGHT_VAR);
    });
  }

  protected update(): void {
    if (!this.cart.isEmpty()) {
      this.confirming.set(true);
    } else {
      void this.updates.apply();
    }
  }

  protected apply(): void {
    void this.updates.apply();
  }
}
