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

/** Mirrors the backend's Sale.MAX_TIP: highest tip accepted, to catch typos. */
export const MAX_TIP = 10_000;

/** Mirrors the backend's RegisterSaleRequest. Prices are never sent: the backend computes them. */
export interface RegisterSaleRequest {
  paymentMethod: PaymentMethod;
  lines: SaleLineRequest[];
  /** Charged with the same payment method, kept apart from the products subtotal. */
  tipAmount: number;
}

/** Mirrors the backend's SaleLineResponse. */
export interface SaleLineResponse {
  variantId: number;
  variantName: string;
  productId: number;
  productName: string;
  quantity: number;
}

export type SaleStatus = 'ACTIVE' | 'VOIDED';

/** Mirrors the backend's Sale.MAX_VOID_REASON_LENGTH. */
export const MAX_VOID_REASON_LENGTH = 100;

/** Mirrors the backend's VoidSaleRequest. */
export interface VoidSaleRequest {
  reason: string | null;
}

/** Mirrors the backend's SaleResponse. */
export interface SaleResponse {
  id: number;
  eventId: number;
  paymentMethod: PaymentMethod;
  lines: SaleLineResponse[];
  /** Products total, promos applied. */
  subtotal: number;
  tipAmount: number;
  /** subtotal + tipAmount. */
  amountToCharge: number;
  createdAt: string;
  status: SaleStatus;
  /** Null unless status is VOIDED. */
  voidedAt: string | null;
  /** Optional even when voided. */
  voidReason: string | null;
}
