import { formatClp } from '../shared/clp';
import { PAYMENT_METHOD_LABELS, SaleLineResponse, SaleResponse } from './sale';

/** Name the menu gives the only variant of a product: not worth repeating in a summary. */
export const SINGLE_VARIANT_NAME = 'Única';

/** "2× Jack Daniels Original · 1× Red Bull". */
export function saleSummary(lines: readonly SaleLineResponse[]): string {
  return lines
    .map((line) => {
      const name =
        line.variantName === SINGLE_VARIANT_NAME
          ? line.productName
          : `${line.productName} ${line.variantName}`;
      return `${line.quantity}× ${name}`;
    })
    .join(' · ');
}

/** "¿Anular venta de $8.000 (Efectivo)?" — the amount charged, tip included. */
export function voidQuestion(sale: SaleResponse): string {
  return `¿Anular venta de ${formatClp(sale.amountToCharge)} (${PAYMENT_METHOD_LABELS[sale.paymentMethod]})?`;
}

/** Shown once a sale is voided: no money moves (cash given back is a refund). */
export const SALE_VOIDED_NOTICE = 'Venta anulada.';

/** Shown once a refund is recorded, repeating what to hand over. */
export function refundNotice(amount: number): string {
  return `Devolución registrada. Entrega ${formatClp(amount)} de la caja.`;
}

/** Shown once a refund entered by mistake is voided. */
export const REFUND_VOIDED_NOTICE = 'Devolución anulada.';

/**
 * Shown once a saved cart comes back after a reload: "Pedido recuperado · 3 productos", or naming what
 * was dropped because it is no longer on the menu.
 */
export function restoredNotice(itemCount: number, removed: readonly string[]): string {
  if (removed.length === 0) {
    return `Pedido recuperado · ${itemCount} ${itemCount === 1 ? 'producto' : 'productos'}`;
  }
  const names =
    removed.length === 1 ? removed[0] : `${removed.slice(0, -1).join(', ')} y ${removed.at(-1)}`;
  const gone =
    removed.length === 1
      ? `${names} (ya no está en la carta)`
      : `${names} (ya no están en la carta)`;
  if (itemCount === 0) {
    return `No se recuperó el pedido: se quit${removed.length === 1 ? 'ó' : 'aron'} ${gone}`;
  }
  return `Pedido recuperado. Se quit${removed.length === 1 ? 'ó' : 'aron'} ${gone}`;
}
