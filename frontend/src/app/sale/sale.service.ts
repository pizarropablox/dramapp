import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { RegisterSaleRequest, SaleResponse } from './sale';

@Service()
export class SaleService {
  private readonly http = inject(HttpClient);

  register(request: RegisterSaleRequest): Observable<SaleResponse> {
    return this.http.post<SaleResponse>('/api/sales', request);
  }
}
