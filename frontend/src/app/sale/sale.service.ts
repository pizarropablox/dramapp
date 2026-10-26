import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { RegisterSaleRequest, SaleResponse, VoidSaleRequest } from './sale';

/**
 * How long a sale waits for the backend. Past it, the request is cancelled (a late answer is ignored) and
 * the sale is treated like a network error: it may have been registered, the cashier checks.
 */
export const SALE_REQUEST_TIMEOUT_MS = 15_000;

@Service()
export class SaleService {
  private readonly http = inject(HttpClient);

  /** Fails with rxjs' TimeoutError after SALE_REQUEST_TIMEOUT_MS. Only here: the rest of the API waits. */
  register(request: RegisterSaleRequest): Observable<SaleResponse> {
    return this.http
      .post<SaleResponse>('/api/sales', request)
      .pipe(timeout(SALE_REQUEST_TIMEOUT_MS));
  }

  /** Latest sales of the open event (newest first, voided ones included); empty without an open event. */
  recent(): Observable<SaleResponse[]> {
    return this.http.get<SaleResponse[]>('/api/sales');
  }

  /** Records the void; the money is given back outside the app. A blank reason is sent as null. */
  voidSale(id: number, reason: string): Observable<SaleResponse> {
    const body: VoidSaleRequest = { reason: reason.trim() || null };
    return this.http.post<SaleResponse>(`/api/sales/${id}/void`, body);
  }
}
