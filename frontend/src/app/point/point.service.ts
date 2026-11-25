import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { Observable, timeout } from 'rxjs';
import {
  PointOrderOutcome,
  PointOrderResponse,
  PointSaleMark,
  PointTerminal,
  ValeResponse,
} from './point';

/** Longer than the backend waits for Mercado Pago (11 s); past it, it counts as no answer. */
export const POINT_REQUEST_TIMEOUT_MS = 15_000;

/** Charging with the Point Smart and its vales (DRAMA-71). */
@Service()
export class PointService {
  private readonly http = inject(HttpClient);

  /** Empty when the Point is off. */
  terminals(): Observable<PointTerminal[]> {
    return this.http
      .get<PointTerminal[]>('/api/point/terminals')
      .pipe(timeout(POINT_REQUEST_TIMEOUT_MS));
  }

  /** Sales of the open event whose charge someone must look at. */
  markedSales(): Observable<PointSaleMark[]> {
    return this.http
      .get<PointSaleMark[]>('/api/point/sales')
      .pipe(timeout(POINT_REQUEST_TIMEOUT_MS));
  }

  /** Repeating it never charges twice. */
  send(
    saleId: number,
    terminalId: string,
    cancelPendingVale = false,
  ): Observable<PointOrderResponse> {
    return this.post(`/api/sales/${saleId}/point-order`, { terminalId, cancelPendingVale });
  }

  /** The backend asks Mercado Pago every time. */
  follow(saleId: number): Observable<PointOrderResponse> {
    return this.http
      .get<PointOrderResponse>(`/api/sales/${saleId}/point-order`)
      .pipe(timeout(POINT_REQUEST_TIMEOUT_MS));
  }

  cancel(saleId: number): Observable<PointOrderResponse> {
    return this.post(`/api/sales/${saleId}/point-order/cancel`, null);
  }

  closeByHand(saleId: number, outcome: PointOrderOutcome): Observable<PointOrderResponse> {
    return this.post(`/api/sales/${saleId}/point-order/resolve`, { outcome });
  }

  /** «Recibido», or again when the vale was rejected. Repeating it prints once. */
  printVale(saleId: number, terminalId: string): Observable<ValeResponse> {
    return this.post(`/api/sales/${saleId}/vale`, { terminalId });
  }

  vale(saleId: number): Observable<ValeResponse> {
    return this.http
      .get<ValeResponse>(`/api/sales/${saleId}/vale`)
      .pipe(timeout(POINT_REQUEST_TIMEOUT_MS));
  }

  /** Only the last vale of that Smart. */
  reprint(saleId: number, terminalId: string): Observable<ValeResponse> {
    return this.post('/api/vales/latest/reprint', { saleId, terminalId });
  }

  private post<T>(url: string, body: unknown): Observable<T> {
    return this.http.post<T>(url, body).pipe(timeout(POINT_REQUEST_TIMEOUT_MS));
  }
}
