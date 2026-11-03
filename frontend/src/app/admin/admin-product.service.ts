import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import { AdminProductResponse, CreateProductRequest, CreateVariantRequest } from './admin-product';

/** ⚙️ Administración > Carta. admin only: barra gets a 403. */
@Service()
export class AdminProductService {
  private readonly http = inject(HttpClient);

  /** Every product with every variant, deactivated ones included, in menu order. */
  getAll(): Observable<AdminProductResponse[]> {
    return this.http.get<AdminProductResponse[]>('/api/products/all');
  }

  /** Added at the end of the Venta grid. */
  create(request: CreateProductRequest): Observable<AdminProductResponse> {
    return this.http.post<AdminProductResponse>('/api/products', request);
  }

  /** Added at the end of the product's variants; answers the whole product. */
  addVariant(productId: number, request: CreateVariantRequest): Observable<AdminProductResponse> {
    return this.http.post<AdminProductResponse>(`/api/products/${productId}/variants`, request);
  }
}
