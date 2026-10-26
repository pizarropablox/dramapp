import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { CartStore } from '../sale/cart-store';
import { AuthStore } from './auth-store';
import { AuthService } from './auth.service';
import { formatExpiry } from './session-format';

/**
 * Who is logged in and until when, the admin-only link to /estado, and "Cerrar sesión".
 * Logging out on purpose empties the cart, the saved one too (someone else may use the phone next);
 * a 401 does not.
 */
@Component({
  selector: 'app-session-bar',
  imports: [RouterLink],
  template: `
    @if (auth.session(); as session) {
      <section class="session" aria-label="Sesión">
        <p>
          Sesión <strong>{{ session.username }}</strong> · hasta {{ expiry() }}
        </p>
        @if (confirming()) {
          <p class="question" role="alert">¿Cerrar sesión? Se vacía el carrito.</p>
          <div class="actions">
            <button type="button" [disabled]="leaving()" (click)="confirming.set(false)">
              Cancelar
            </button>
            <button type="button" class="leave" [disabled]="leaving()" (click)="logout()">
              {{ leaving() ? 'Cerrando…' : 'Sí, cerrar' }}
            </button>
          </div>
        } @else {
          <div class="actions">
            @if (auth.isAdmin()) {
              <a class="link" routerLink="/estado">Estado del sistema</a>
            }
            <button type="button" (click)="confirming.set(true)">Cerrar sesión</button>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .session {
      display: grid;
      gap: 0.6rem;
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid var(--border);
      color: var(--muted);
    }

    p {
      margin: 0;
    }

    strong {
      color: var(--text);
    }

    .question {
      color: var(--text);
      font-weight: 700;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .actions > * {
      flex: 1;
    }

    .link {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      padding: 0 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      color: var(--text);
      text-decoration: none;
    }

    .leave {
      border: none;
      background: var(--danger);
      color: var(--on-danger);
      font-weight: 700;
    }
  `,
})
export class SessionBar {
  protected readonly auth = inject(AuthStore);
  private readonly authService = inject(AuthService);
  private readonly cart = inject(CartStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly confirming = signal(false);
  protected readonly leaving = signal(false);
  protected readonly expiry = computed(() => {
    const session = this.auth.session();
    return session ? formatExpiry(session.expiresAt, Date.now()) : '';
  });

  protected logout(): void {
    this.leaving.set(true);
    this.authService
      .logout()
      .pipe(
        // Even if the backend cannot be reached, this phone forgets the session.
        finalize(() => {
          this.auth.clear();
          this.cart.clear();
          void this.router.navigateByUrl('/login');
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({ error: () => undefined });
  }
}
