export type RefundStatus = 'ACTIVE' | 'VOIDED';

/** Mirrors the backend's Refund.MAX_AMOUNT: highest amount accepted, to catch typos. */
export const MAX_REFUND_AMOUNT = 100_000;

/** Mirrors the backend's Refund.MAX_REASON_LENGTH. */
export const MAX_REFUND_REASON_LENGTH = 100;

/** Mirrors the backend's CreateRefundRequest: both fields are required. */
export interface CreateRefundRequest {
  /** Cash given back from the till, in whole pesos. */
  amount: number;
  reason: string;
}

/** Mirrors the backend's RefundResponse. */
export interface RefundResponse {
  id: number;
  eventId: number;
  amount: number;
  reason: string;
  status: RefundStatus;
  createdAt: string;
  /** Null unless status is VOIDED. */
  voidedAt: string | null;
}
