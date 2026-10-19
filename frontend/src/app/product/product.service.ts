import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { ProductResponse } from './product';

@Service()
export class ProductService {
  private readonly http = inject(HttpClient);

  /** Active products in menu order, each with its active variants. */
  getMenu(): Observable<ProductResponse[]> {
    return this.http.get<ProductResponse[]>('/api/products');
  }
}
