import { HttpClient, HttpErrorResponse, HttpStatusCode } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { catchError, Observable, of, throwError } from 'rxjs';
import { EventResponse } from './event';

@Service()
export class EventService {
  private readonly http = inject(HttpClient);

  /** The open event, or null when there is none (the backend answers 404). */
  current(): Observable<EventResponse | null> {
    return this.http
      .get<EventResponse>('/api/events/current')
      .pipe(
        catchError((error: unknown) =>
          error instanceof HttpErrorResponse && error.status === HttpStatusCode.NotFound
            ? of(null)
            : throwError(() => error),
        ),
      );
  }
}
