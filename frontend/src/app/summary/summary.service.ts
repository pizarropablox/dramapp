import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { catchError, from, map, Observable, switchMap, throwError } from 'rxjs';
import { withJsonErrorBody } from '../shared/api-error';
import { fileNameFromDisposition, XLSX_TYPE } from './event-export';
import { EventSummaryResponse } from './summary';

@Service()
export class SummaryService {
  private readonly http = inject(HttpClient);

  /** The open event's summary or, when none is open, the last closed one's. 404 when there are no events. */
  latest(): Observable<EventSummaryResponse> {
    return this.http
      .get<EventSummaryResponse>('/api/events/latest/summary')
      .pipe(map(withRefundDefaults));
  }

  byEvent(eventId: number): Observable<EventSummaryResponse> {
    return this.http
      .get<EventSummaryResponse>(`/api/events/${eventId}/summary`)
      .pipe(map(withRefundDefaults));
  }

  /**
   * The event's .xlsx (admin only), named as the backend says. Through HttpClient, not a link: the session cookie
   * and the 401 handling work as in any other call, also in the installed PWA.
   */
  exportEvent(eventId: number): Observable<File> {
    return this.http
      .get(`/api/events/${eventId}/export`, { observe: 'response', responseType: 'blob' })
      .pipe(
        map(
          (response) =>
            new File(
              [response.body ?? new Blob()],
              fileNameFromDisposition(response.headers.get('Content-Disposition')),
              { type: XLSX_TYPE },
            ),
        ),
        catchError((error: unknown) =>
          from(withJsonErrorBody(error)).pipe(switchMap((parsed) => throwError(() => parsed))),
        ),
      );
  }
}

const NO_REFUNDS = { count: 0, amount: 0, voidedCount: 0, voidedAmount: 0 };

/**
 * A backend older than DRAMA-41 (deploys are minutes apart) sends no refund fields: without refunds,
 * the expected amount is the total.
 */
export function withRefundDefaults(summary: EventSummaryResponse): EventSummaryResponse {
  return {
    ...summary,
    byPaymentMethod: summary.byPaymentMethod.map((method) => ({
      ...method,
      refunds: method.refunds ?? 0,
      expected: method.expected ?? method.total,
    })),
    overall: {
      ...summary.overall,
      refunds: summary.overall.refunds ?? 0,
      expected: summary.overall.expected ?? summary.overall.total,
    },
    refunds: summary.refunds ?? NO_REFUNDS,
  };
}
