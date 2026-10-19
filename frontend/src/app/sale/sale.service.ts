import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { RegisterSaleRequest, SaleResponse, VoidSaleRequest } from './sale';

@Service()
export class SaleService {
  private readonly http = inject(HttpClient);

  register(request: RegisterSaleRequest): Observable<SaleResponse> {
    return this.http.post<SaleResponse>('/api/sales', request);
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
