import { HttpClient, HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { catchError, map, Observable, of, throwError } from 'rxjs';
import { LoginRequest, LoginResponse, Session } from './auth';

@Service()
export class AuthService {
  private readonly http = inject(HttpClient);

  /** The backend sets the HttpOnly session cookie; the token in the body is not kept. */
  login(request: LoginRequest): Observable<Session> {
    return this.http
      .post<LoginResponse>('/api/auth/login', request)
      .pipe(map(({ username, role, expiresAt }) => ({ username, role, expiresAt })));
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', null);
  }

  /** The current session, or null when there is none (the backend answers 401). */
  me(): Observable<Session | null> {
    return this.http
      .get<Session>('/api/auth/me')
      .pipe(
        catchError((error: unknown) =>
          error instanceof HttpErrorResponse && error.status === HttpStatusCode.Unauthorized
            ? of(null)
            : throwError(() => error),
        ),
      );
  }
}
