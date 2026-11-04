import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AdminProductResponse,
  CreateProductRequest,
  CreateVariantRequest,
  UpdateProductRequest,
  UpdateVariantRequest,
} from './admin-product';

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

  /** Past sales keep their prices; they show the new name, which is not stored with them. */
  update(productId: number, request: UpdateProductRequest): Observable<AdminProductResponse> {
    return this.http.put<AdminProductResponse>(`/api/products/${productId}`, request);
  }

  /**
   * Added at the end of the product's variants, or in the place of "Única" if the product has no variants;
   * answers the whole product.
   */
  addVariant(productId: number, request: CreateVariantRequest): Observable<AdminProductResponse> {
    return this.http.post<AdminProductResponse>(`/api/products/${productId}/variants`, request);
  }

  /** Answers the whole product. */
  renameVariant(
    productId: number,
    variantId: number,
    request: UpdateVariantRequest,
  ): Observable<AdminProductResponse> {
    return this.http.put<AdminProductResponse>(
      `/api/products/${productId}/variants/${variantId}`,
      request,
    );
  }

  /** Never with an open event (409). Its variants are not touched. Answers the whole product. */
  deactivate(productId: number): Observable<AdminProductResponse> {
    return this.http.post<AdminProductResponse>(`/api/products/${productId}/deactivate`, null);
  }

  /** Back to its place in the Venta grid. Answers the whole product. */
  reactivate(productId: number): Observable<AdminProductResponse> {
    return this.http.post<AdminProductResponse>(`/api/products/${productId}/reactivate`, null);
  }

  /** Never with an open event, nor the last active variant (409). Answers the whole product. */
  deactivateVariant(productId: number, variantId: number): Observable<AdminProductResponse> {
    return this.http.post<AdminProductResponse>(
      `/api/products/${productId}/variants/${variantId}/deactivate`,
      null,
    );
  }

  /** Answers the whole product. */
  reactivateVariant(productId: number, variantId: number): Observable<AdminProductResponse> {
    return this.http.post<AdminProductResponse>(
      `/api/products/${productId}/variants/${variantId}/reactivate`,
      null,
    );
  }
}
