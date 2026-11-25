import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken, Service, signal } from '@angular/core';
import { PointTerminal } from './point';

/** Its own key: logging out or emptying the cart never resets it. */
export const POINT_TERMINAL_STORAGE_KEY = 'dramapp.pointTerminal';

/** Where this phone keeps its Smart and its charge in progress. A token so tests can use an in-memory one. */
export const POINT_STORAGE = new InjectionToken<Storage | null>('POINT_STORAGE', {
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
 * What this phone charges Mercado Pago with (DRAMA-71). Null is a Point Mini, the default: the amount is typed
 * on the machine and everything works as it always has.
 */
@Service()
export class PointTerminalStore {
  private readonly storage = inject(POINT_STORAGE);

  private readonly terminalState = signal<PointTerminal | null>(this.read());

  readonly terminal = this.terminalState.asReadonly();

  set(terminal: PointTerminal | null): void {
    this.terminalState.set(terminal);
    try {
      if (terminal) {
        this.storage?.setItem(POINT_TERMINAL_STORAGE_KEY, JSON.stringify(terminal));
      } else {
        this.storage?.removeItem(POINT_TERMINAL_STORAGE_KEY);
      }
    } catch {
      // Still applied; it just will not survive a reload.
    }
  }

  private read(): PointTerminal | null {
    try {
      const saved: unknown = JSON.parse(
        this.storage?.getItem(POINT_TERMINAL_STORAGE_KEY) ?? 'null',
      );
      return isTerminal(saved) ? { id: saved.id, name: saved.name } : null;
    } catch {
      return null;
    }
  }
}

export function isTerminal(value: unknown): value is PointTerminal {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { id, name } = value as Partial<Record<keyof PointTerminal, unknown>>;
  return typeof id === 'string' && id !== '' && typeof name === 'string' && name !== '';
}
