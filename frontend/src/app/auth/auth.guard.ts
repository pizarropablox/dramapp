import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthStore } from './auth-store';

/** Only app paths: never send the user to another site after logging in. */
export function safeReturnUrl(url: unknown): string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/';
}

export function loginUrl(router: Router, returnUrl: string, expired = false): UrlTree {
  const queryParams: Record<string, string> = {};
  if (safeReturnUrl(returnUrl) !== '/') {
    queryParams['returnUrl'] = returnUrl;
  }
  if (expired) {
    queryParams['expired'] = '1';
  }
  return router.createUrlTree(['/login'], { queryParams });
}

/** Any logged-in role (barra or admin). */
export const authGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AuthStore)
    .restore()
    .pipe(
      map((session) => session !== null || loginUrl(router, state.url)),
      // Backend unreachable: let the page show its own "no connection" error. A 401 later still
      // leads to the login (authInterceptor).
      catchError(() => of(true)),
    );
};

/** admin only; barra goes back to the sale screen. */
export const adminGuard: CanActivateFn = (_route, state) => {
  const router = inject(Router);
  return inject(AuthStore)
    .restore()
    .pipe(
      map((session) => {
        if (!session) {
          return loginUrl(router, state.url);
        }
        return session.role === 'ADMIN' || router.createUrlTree(['/']);
      }),
      catchError(() => of(router.createUrlTree(['/']))),
    );
};

/** The login screen, only without a session. */
export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(AuthStore)
    .restore()
    .pipe(
      map((session) => session === null || router.createUrlTree(['/'])),
      catchError(() => of(true)),
    );
};
