import { HttpErrorResponse, HttpInterceptorFn, HttpStatusCode } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthStore } from './auth-store';
import { loginUrl } from './auth.guard';

/**
 * A 401 means the session ended (expired, or the secret was rotated): back to the login, then back here.
 * The router navigates without reloading the page, so the cart (CartStore, app-wide) is kept.
 * The /api/auth/* calls handle their own 401s (wrong password, no session yet).
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const store = inject(AuthStore);
  const router = inject(Router);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse &&
        error.status === HttpStatusCode.Unauthorized &&
        !request.url.startsWith('/api/auth/')
      ) {
        store.clear();
        if (!router.url.startsWith('/login')) {
          void router.navigateByUrl(loginUrl(router, router.url, true));
        }
      }
      return throwError(() => error);
    }),
  );
};
