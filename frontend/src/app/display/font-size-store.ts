import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken, Service, signal } from '@angular/core';

/** Its own key, not inside dramapp.cart: logging out or emptying the cart never resets it. */
export const FONT_SIZE_STORAGE_KEY = 'dramapp.fontSize';

/** Normal is today's look; the others scale the whole app from the root (see styles.scss). */
export type FontSize = 'normal' | 'large' | 'xlarge';

export const FONT_SIZES: readonly FontSize[] = ['normal', 'large', 'xlarge'];

export const FONT_SIZE_LABELS: Record<FontSize, string> = {
  normal: 'Normal',
  large: 'Grande',
  xlarge: 'Muy grande',
};

/** Where this phone keeps its choice. A token so tests can use an in-memory one (or one that fails). */
export const FONT_SIZE_STORAGE = new InjectionToken<Storage | null>('FONT_SIZE_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

/**
 * The text size chosen on this phone (the cashier needs larger text; screen width does not tell phones
 * apart). Applied as data-font-size on <html>; Normal removes it so the app looks exactly as before.
 */
@Service()
export class FontSizeStore {
  private readonly storage = inject(FONT_SIZE_STORAGE);
  private readonly root = inject(DOCUMENT).documentElement;

  private readonly sizeState = signal<FontSize>(this.read());

  readonly size = this.sizeState.asReadonly();

  constructor() {
    this.apply(this.sizeState());
  }

  set(size: FontSize): void {
    this.sizeState.set(size);
    this.apply(size);
    try {
      this.storage?.setItem(FONT_SIZE_STORAGE_KEY, size);
    } catch {
      // Still applied; it just will not survive a reload.
    }
  }

  private read(): FontSize {
    try {
      const saved = this.storage?.getItem(FONT_SIZE_STORAGE_KEY);
      return FONT_SIZES.find((size) => size === saved) ?? 'normal';
    } catch {
      return 'normal';
    }
  }

  private apply(size: FontSize): void {
    if (size === 'normal') {
      this.root.removeAttribute('data-font-size');
    } else {
      this.root.setAttribute('data-font-size', size);
    }
  }
}
