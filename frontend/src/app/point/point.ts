import { HttpErrorResponse } from '@angular/common/http';
import { SaleStatus } from '../sale/sale';

/** Mirrors the backend's PointProperties.Terminal: a Point Smart this phone can charge with. */
export interface PointTerminal {
  id: string;
  /** "Smart 1". */
  name: string;
}

/** Mirrors the backend's PointOrderState. */
export type PointOrderState =
  'SENDING' | 'NOT_SENT' | 'SENT' | 'WAITING' | 'CANCELING' | 'ATTENTION' | 'PAID' | 'CANCELED';

/** Mirrors the backend's PointOrderOutcome: what the Smart shows, when closing by hand. */
export type PointOrderOutcome = 'PAID' | 'NOT_PAID';

/** Mirrors the backend's ValeState. */
export type ValeState = 'PENDING' | 'PRINTING' | 'PRINTED' | 'REJECTED' | 'GONE' | 'UNKNOWN';

/** Mirrors the backend's ValeResponse: the last vale of a sale. */
export interface ValeResponse {
  saleId: number;
  state: ValeState;
  kind: 'ORIGINAL' | 'REPRINT';
  terminalId: string;
  terminalName: string;
  error: string | null;
  /** Rejected because the Smart has a charge or another vale. */
  busy: boolean;
  /** A reprint whose previous paper came out, or may have. */
  mayBeDouble: boolean;
  secondsSinceRequested: number;
}

/** Mirrors the backend's PointOrderResponse. */
export interface PointOrderResponse {
  saleId: number;
  state: PointOrderState;
  status: string | null;
  statusDetail: string | null;
  amount: number;
  terminalId: string | null;
  terminalName: string | null;
  secondsSinceCreated: number;
  cancelRequested: boolean;
  saleStatus: SaleStatus;
  voidReason: string | null;
  pendingVerification: boolean;
  paidOnVoidedSale: boolean;
  vale: ValeResponse | null;
}

/** Codes of the ProblemDetail the Point endpoints answer with (PointException, ValeException). */
export type PointErrorCode =
  | 'POINT_TERMINAL_UNKNOWN'
  | 'POINT_BUSY'
  | 'POINT_BUSY_VALE'
  | 'POINT_BUSY_UNKNOWN'
  | 'POINT_PRINTING'
  | 'POINT_ORDER_REJECTED'
  | 'POINT_NOT_CONFIGURED'
  | 'POINT_UNAVAILABLE'
  | 'POINT_UNCERTAIN'
  | 'POINT_CANNOT_CANCEL'
  | 'POINT_NOT_CLOSABLE'
  | 'POINT_ORDER_OPEN'
  | 'POINT_ORDER_NOT_FOUND'
  | 'SALE_NOT_CHARGEABLE'
  | 'VALE_PRINTING'
  | 'VALE_STUCK'
  | 'VALE_NOT_ALLOWED'
  | 'VALE_NOT_LATEST'
  | 'VALE_NOT_FOUND';

/** What POINT_BUSY and POINT_BUSY_VALE say about who holds the Smart. */
export interface BusyPoint {
  saleId: number;
  /** Only for a charge. */
  amount: number | null;
}

function body(error: unknown): Record<string, unknown> | null {
  return error instanceof HttpErrorResponse && typeof error.error === 'object'
    ? (error.error as Record<string, unknown> | null)
    : null;
}

/** Null when it is not one of ours: no connection, timeout, a proxy's 502. */
export function pointErrorCode(error: unknown): PointErrorCode | null {
  const code = body(error)?.['code'];
  return typeof code === 'string' ? (code as PointErrorCode) : null;
}

export function busyPoint(error: unknown): BusyPoint | null {
  const problem = body(error);
  const saleId = problem?.['saleId'];
  const amount = problem?.['amount'];
  return typeof saleId === 'number'
    ? { saleId, amount: typeof amount === 'number' ? amount : null }
    : null;
}
