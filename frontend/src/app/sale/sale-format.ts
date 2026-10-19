import { formatClp } from '../shared/clp';
import { PAYMENT_METHOD_LABELS, PaymentMethod, SaleLineResponse, SaleResponse } from './sale';

/** Name the menu gives the only variant of a product: not worth repeating in a summary. */
const SINGLE_VARIANT_NAME = 'Única';

/** The party is in San Bernardo: show Chilean time whatever the phone's settings. */
const timeFormatter = new Intl.DateTimeFormat('es-CL', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Santiago',
});

/** "2026-10-31T23:15:00Z" -> "20:15". */
export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

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

/** What the cashier must do to give the money back: the app only records the void. */
export const REFUND_REMINDERS: Record<PaymentMethod, string> = {
  EFECTIVO: 'Devuelve el efectivo de la caja.',
  MERCADO_PAGO: 'Recuerda hacer la devolución en la app de Mercado Pago.',
};

/** "¿Anular venta de $8.000 (Efectivo)?" — the amount charged, tip included. */
export function voidQuestion(sale: SaleResponse): string {
  return `¿Anular venta de ${formatClp(sale.amountToCharge)} (${PAYMENT_METHOD_LABELS[sale.paymentMethod]})?`;
}

/** Shown once the void is recorded, reminding how to give the money back. */
export function voidedNotice(sale: SaleResponse): string {
  const amount = formatClp(sale.amountToCharge);
  return sale.paymentMethod === 'EFECTIVO'
    ? `Venta anulada. Devuelve ${amount} en efectivo de la caja.`
    : `Venta anulada. Devuelve ${amount} en la app de Mercado Pago.`;
}
