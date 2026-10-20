import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { AuthStore } from './auth-store';
import { expiresSoon, formatExpiry } from './session-format';

/** How often the remaining time is checked. */
const CHECK_INTERVAL_MS = 60_000;

/**
 * Warns on the sale screen when the session ends within 3 hours, so the cashier logs in again
 * between sales instead of in the middle of one. Hidden the rest of the time.
 */
@Component({
  selector: 'app-session-expiry-notice',
  template: `
    @if (expiry(); as expiry) {
      <p class="notice" role="status">
        La sesión vence {{ expiry }}. Cierra sesión en Totales y vuelve a entrar.
      </p>
    }
  `,
  styles: `
    .notice {
      margin: 0 0.75rem 0.375rem;
      padding: 0.4rem 0.6rem;
      border-left: 4px solid var(--focus);
      border-radius: 0.5rem;
      background: var(--surface-2);
      font-size: 0.9rem;
    }
  `,
})
export class SessionExpiryNotice {
  private readonly auth = inject(AuthStore);
  private readonly now = signal(Date.now());

  protected readonly expiry = computed(() => {
    const session = this.auth.session();
    const now = this.now();
    return session && expiresSoon(session.expiresAt, now)
      ? formatExpiry(session.expiresAt, now)
      : null;
  });

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), CHECK_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
}
