export type PaymentMethod = 'MERCADO_PAGO' | 'EFECTIVO';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  MERCADO_PAGO: 'Mercado Pago',
  EFECTIVO: 'Efectivo',
};

/** Mirrors the backend's SaleLineRequest. */
export interface SaleLineRequest {
  variantId: number;
  quantity: number;
}

/** Mirrors the backend's RegisterSaleRequest. Prices are never sent: the backend computes them. */
export interface RegisterSaleRequest {
  paymentMethod: PaymentMethod;
  lines: SaleLineRequest[];
}

/** Mirrors the backend's SaleLineResponse. */
export interface SaleLineResponse {
  variantId: number;
  variantName: string;
  productId: number;
  productName: string;
  quantity: number;
}

/** Mirrors the backend's SaleResponse. */
export interface SaleResponse {
  id: number;
  eventId: number;
  paymentMethod: PaymentMethod;
  lines: SaleLineResponse[];
  subtotal: number;
  tip: number;
  total: number;
  createdAt: string;
}
