import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { map, Observable } from 'rxjs';
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
