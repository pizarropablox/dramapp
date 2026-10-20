import { computed, inject, Service, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';
import { Session } from './auth';
import { AuthService } from './auth.service';

/** The logged-in user, app-wide. */
@Service()
export class AuthStore {
  private readonly authService = inject(AuthService);

  private readonly sessionState = signal<Session | null>(null);
  /** Whether the backend already said who is logged in during this page load. */
  private known = false;

  readonly session = this.sessionState.asReadonly();
  readonly isAdmin = computed(() => this.sessionState()?.role === 'ADMIN');

  /**
   * The session, asking the backend once per page load (the cookie survives reloads, the signal does not).
   * Errors other than 401 (no connection, cold start) propagate and leave the session unknown.
   */
  restore(): Observable<Session | null> {
    if (this.known) {
      return of(this.sessionState());
    }
    return this.authService.me().pipe(tap((session) => this.set(session)));
  }

  signedIn(session: Session): void {
    this.set(session);
  }

  /** The session ended (logout, or a 401 from the backend). */
  clear(): void {
    this.set(null);
  }

  private set(session: Session | null): void {
    this.sessionState.set(session);
    this.known = true;
  }
}
