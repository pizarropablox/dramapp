import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import { ProductResponse, StockOutResponse } from './product';

/**
 * How long marking «Agotado» waits: the sheet stays open meanwhile, and the bar has poor signal. Retrying is
 * safe, repeating either action changes nothing.
 */
export const STOCK_REQUEST_TIMEOUT_MS = 10_000;

@Service()
export class ProductService {
  private readonly http = inject(HttpClient);

  /** Active products in menu order, each with its active variants and its «Agotado» marks. */
  getMenu(): Observable<ProductResponse[]> {
    return this.http.get<ProductResponse[]>('/api/products');
  }

  /** Answers with every current mark of the event. */
  markOutOfStock(productId: number, variantId: number): Observable<StockOutResponse[]> {
    return this.stockAction(productId, variantId, 'out-of-stock');
  }

  /** More came. Answers with every current mark of the event. */
  restock(productId: number, variantId: number): Observable<StockOutResponse[]> {
    return this.stockAction(productId, variantId, 'restock');
  }

  private stockAction(
    productId: number,
    variantId: number,
    action: string,
  ): Observable<StockOutResponse[]> {
    return this.http
      .post<StockOutResponse[]>(`/api/products/${productId}/variants/${variantId}/${action}`, null)
      .pipe(timeout(STOCK_REQUEST_TIMEOUT_MS));
  }
}
