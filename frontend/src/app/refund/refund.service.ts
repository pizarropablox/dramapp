import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { CreateRefundRequest, RefundResponse } from './refund';

/** Cash given back from the till during the open event, apart from any sale. */
@Service()
export class RefundService {
  private readonly http = inject(HttpClient);

  /** The reason is sent trimmed. */
  create(request: CreateRefundRequest): Observable<RefundResponse> {
    return this.http.post<RefundResponse>('/api/refunds', {
      amount: request.amount,
      reason: request.reason.trim(),
    });
  }

  /** Latest refunds of the open event (newest first, voided ones included); empty without an open event. */
  recent(): Observable<RefundResponse[]> {
    return this.http.get<RefundResponse[]>('/api/refunds');
  }

  /** For a refund entered by mistake: it stays listed, struck through, and no longer counts. */
  voidRefund(id: number): Observable<RefundResponse> {
    return this.http.post<RefundResponse>(`/api/refunds/${id}/void`, null);
  }
}
