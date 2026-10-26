import { DOCUMENT } from '@angular/common';
import { inject, InjectionToken } from '@angular/core';
import { ProductResponse } from '../product/product';
import { CartLine } from './cart-store';
import { MAX_TIP, PAYMENT_METHOD_LABELS, PaymentMethod } from './sale';
import { NO_TIP, TipChoice } from './tip-selector';

/** One fixed key: at most one saved cart per phone, with its owner inside. */
export const CART_STORAGE_KEY = 'dramapp.cart';
/** Bumped when the format changes: an old cart is then discarded instead of misread. */
export const CART_STORAGE_VERSION = 1;
/** An order in the queue takes minutes; one older than this is an abandoned cart. */
export const CART_MAX_AGE_MS = 2 * 60 * 60_000;
/** More units than this in one line is corrupt data, not an order. */
export const MAX_SAVED_QUANTITY = 99;

/**
 * Where the cart is saved: localStorage, which survives closing Safari or the installed app.
 * A token so tests can use an in-memory one (or one that fails). Null when the browser blocks it.
 */
export const CART_STORAGE = new InjectionToken<Storage | null>('CART_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return inject(DOCUMENT).defaultView?.localStorage ?? null;
    } catch {
      return null;
    }
  },
});

/** Whose cart it is: a cart is only restored for the same open event and user. */
export interface CartOwner {
  /** Null without an open event: nothing can be sold, so nothing is saved or restored. */
  eventId: number | null;
  username: string;
}

/**
 * A sale sent to the backend whose answer never came (no connection, timeout, 5xx): it may have been
 * registered. Kept only to show what was sent; the payment method is never preselected from it.
 */
export interface PendingSale {
  paymentMethod: PaymentMethod;
  amountToCharge: number;
  /** Epoch ms. */
  startedAt: number;
}

/** What is saved: no prices, the total is always recalculated with the current menu. */
interface SavedCart {
  v: typeof CART_STORAGE_VERSION;
  eventId: number;
  username: string;
  /** Epoch ms of the latest change. */
  savedAt: number;
  status: 'editing' | 'sending';
  /** Only while status is 'sending'. */
  sending: PendingSale | null;
  /** label: only to name the line if it is no longer on the menu. */
  lines: { variantId: number; quantity: number; label: string }[];
  tip: TipChoice;
}

export interface CartSnapshot {
  lines: readonly CartLine[];
  tip: TipChoice;
  pending: PendingSale | null;
}

export interface RestoredCart extends CartSnapshot {
  /** Labels of the lines dropped because they are no longer on the menu. */
  removed: string[];
}

/** "Jack Daniels Manzana", or just "Red Bull" when the product has a single variant. */
export function lineLabel(line: CartLine): string {
  return line.product.variants.length > 1
    ? `${line.product.name} ${line.variant.name}`
    : line.product.name;
}

/** Saves the cart. A failure (private mode, no space) only means it will not be restored. */
export function saveCart(
  storage: Storage | null,
  owner: CartOwner & { eventId: number },
  cart: CartSnapshot,
  now: number,
): void {
  const saved: SavedCart = {
    v: CART_STORAGE_VERSION,
    eventId: owner.eventId,
    username: owner.username,
    savedAt: now,
    status: cart.pending ? 'sending' : 'editing',
    sending: cart.pending,
    lines: cart.lines.map((line) => ({
      variantId: line.variant.id,
      quantity: line.quantity,
      label: lineLabel(line),
    })),
    tip: cart.tip,
  };
  try {
    storage?.setItem(CART_STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Selling goes on; this cart just will not survive a reload.
  }
}

export function forgetCart(storage: Storage | null): void {
  try {
    storage?.removeItem(CART_STORAGE_KEY);
  } catch {
    // Nothing to do: the owner and age checks still discard it on the next load.
  }
}

/**
 * The saved cart rebuilt with the current menu, or null when there is none to restore. Anything that
 * cannot be restored (another event or user, older than 2 hours, corrupt) is discarded and forgotten.
 */
export function loadCart(
  storage: Storage | null,
  owner: CartOwner,
  menu: readonly ProductResponse[],
  now: number,
): RestoredCart | null {
  const saved = readCart(storage);
  if (
    !saved ||
    saved.eventId !== owner.eventId ||
    saved.username !== owner.username ||
    now - saved.savedAt > CART_MAX_AGE_MS
  ) {
    forgetCart(storage);
    return null;
  }

  const variants = new Map<number, Omit<CartLine, 'quantity'>>();
  for (const product of menu) {
    for (const variant of product.variants) {
      variants.set(variant.id, { product, variant });
    }
  }
  const lines: CartLine[] = [];
  const removed: string[] = [];
  for (const line of saved.lines) {
    if (
      !isValidQuantity(line.quantity) ||
      lines.some((kept) => kept.variant.id === line.variantId)
    ) {
      continue;
    }
    const current = variants.get(line.variantId);
    if (current) {
      lines.push({ ...current, quantity: line.quantity });
    } else {
      removed.push(line.label);
    }
  }

  const tip = isValidTip(saved.tip)
    ? { amount: saved.tip.amount, custom: saved.tip.custom }
    : NO_TIP;
  if (lines.length === 0 && !saved.sending) {
    forgetCart(storage);
    return removed.length > 0 ? { lines, tip: NO_TIP, pending: null, removed } : null;
  }
  return { lines, tip, pending: saved.sending, removed };
}

function readCart(storage: Storage | null): SavedCart | null {
  let parsed: unknown;
  try {
    const json = storage?.getItem(CART_STORAGE_KEY);
    if (!json) {
      return null;
    }
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  return isSavedCart(parsed) ? parsed : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSavedCart(value: unknown): value is SavedCart {
  if (
    !isObject(value) ||
    value['v'] !== CART_STORAGE_VERSION ||
    !Number.isInteger(value['eventId']) ||
    typeof value['username'] !== 'string' ||
    !Number.isFinite(value['savedAt']) ||
    !Array.isArray(value['lines'])
  ) {
    return false;
  }
  const linesOk = value['lines'].every(
    (line) =>
      isObject(line) && Number.isInteger(line['variantId']) && typeof line['label'] === 'string',
  );
  if (!linesOk) {
    return false;
  }
  if (value['status'] === 'editing') {
    return value['sending'] === null;
  }
  return value['status'] === 'sending' && isPendingSale(value['sending']);
}

function isPendingSale(value: unknown): value is PendingSale {
  return (
    isObject(value) &&
    typeof value['paymentMethod'] === 'string' &&
    Object.hasOwn(PAYMENT_METHOD_LABELS, value['paymentMethod']) &&
    Number.isInteger(value['amountToCharge']) &&
    Number.isFinite(value['startedAt'])
  );
}

function isValidQuantity(quantity: unknown): quantity is number {
  return (
    Number.isInteger(quantity) &&
    (quantity as number) > 0 &&
    (quantity as number) <= MAX_SAVED_QUANTITY
  );
}

function isValidTip(tip: unknown): tip is TipChoice {
  return (
    isObject(tip) &&
    Number.isInteger(tip['amount']) &&
    (tip['amount'] as number) >= 0 &&
    (tip['amount'] as number) <= MAX_TIP &&
    typeof tip['custom'] === 'boolean'
  );
}
