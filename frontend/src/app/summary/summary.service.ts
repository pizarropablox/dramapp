import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { EventSummaryResponse } from './summary';

@Service()
export class SummaryService {
  private readonly http = inject(HttpClient);

  /** The open event's summary or, when none is open, the last closed one's. 404 when there are no events. */
  latest(): Observable<EventSummaryResponse> {
    return this.http.get<EventSummaryResponse>('/api/events/latest/summary');
  }

  byEvent(eventId: number): Observable<EventSummaryResponse> {
    return this.http.get<EventSummaryResponse>(`/api/events/${eventId}/summary`);
  }
}
