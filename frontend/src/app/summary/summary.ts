import { EventResponse } from '../event/event';
import { PaymentMethod } from '../sale/sale';

/** Mirrors the backend's EventSummaryResponse.PaymentMethodTotals. total = sold + tips. */
export interface PaymentMethodTotals {
  paymentMethod: PaymentMethod;
  salesCount: number;
  /** Products total, promos applied. */
  sold: number;
  tips: number;
  total: number;
}

/** Mirrors the backend's EventSummaryResponse.Totals. */
export interface Totals {
  salesCount: number;
  sold: number;
  tips: number;
  total: number;
}

/** Mirrors the backend's EventSummaryResponse.VoidedByPaymentMethod. amount = what had been charged, tip included. */
export interface VoidedByPaymentMethod {
  paymentMethod: PaymentMethod;
  count: number;
  amount: number;
}

/** Mirrors the backend's EventSummaryResponse.VoidedTotals. */
export interface VoidedTotals {
  count: number;
  amount: number;
  byPaymentMethod: VoidedByPaymentMethod[];
}

/** Mirrors the backend's EventSummaryResponse.VariantUnits. */
export interface VariantUnits {
  variantId: number;
  variantName: string;
  units: number;
}

/** Mirrors the backend's EventSummaryResponse.ProductUnits. Most units first. */
export interface ProductUnits {
  productId: number;
  productName: string;
  units: number;
  variants: VariantUnits[];
}

/** Mirrors the backend's EventSummaryResponse. Voided sales count in nothing but voided. */
export interface EventSummaryResponse {
  event: EventResponse;
  /** Both payment methods, Mercado Pago first. */
  byPaymentMethod: PaymentMethodTotals[];
  overall: Totals;
  voided: VoidedTotals;
  products: ProductUnits[];
}
