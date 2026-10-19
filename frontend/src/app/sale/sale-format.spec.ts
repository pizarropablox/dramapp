import { SaleResponse } from './sale';
import { formatTime, REFUND_REMINDERS, saleSummary, voidedNotice, voidQuestion } from './sale-format';

const SALE: SaleResponse = {
  id: 501,
  eventId: 7,
  paymentMethod: 'EFECTIVO',
  lines: [],
  subtotal: 7000,
  tipAmount: 1000,
  amountToCharge: 8000,
  createdAt: '2026-10-31T23:15:00Z',
  status: 'ACTIVE',
  voidedAt: null,
  voidReason: null,
};

describe('sale format', () => {
  it('formats the time in Chilean time, 24 hours', () => {
    // Chile is UTC-3 on that date.
    expect(formatTime('2026-10-31T23:15:00Z')).toBe('20:15');
    expect(formatTime('2026-11-01T04:05:00Z')).toBe('01:05');
  });

  it('summarizes lines, leaving out the single-variant name', () => {
    expect(
      saleSummary([
        { variantId: 91, variantName: 'Original', productId: 9, productName: 'Jack Daniels', quantity: 2 },
        { variantId: 121, variantName: 'Única', productId: 12, productName: 'Red Bull', quantity: 1 },
      ]),
    ).toBe('2× Jack Daniels Original · 1× Red Bull');
  });

  it('asks with the amount charged, tip included, and the payment method', () => {
    expect(voidQuestion(SALE)).toBe('¿Anular venta de $8.000 (Efectivo)?');
    expect(voidQuestion({ ...SALE, paymentMethod: 'MERCADO_PAGO' })).toBe(
      '¿Anular venta de $8.000 (Mercado Pago)?',
    );
  });

  it('reminds how to give the money back by payment method', () => {
    expect(REFUND_REMINDERS.EFECTIVO).toBe('Devuelve el efectivo de la caja.');
    expect(REFUND_REMINDERS.MERCADO_PAGO).toBe('Recuerda hacer la devolución en la app de Mercado Pago.');
    expect(voidedNotice(SALE)).toBe('Venta anulada. Devuelve $8.000 en efectivo de la caja.');
    expect(voidedNotice({ ...SALE, paymentMethod: 'MERCADO_PAGO' })).toBe(
      'Venta anulada. Devuelve $8.000 en la app de Mercado Pago.',
    );
  });
});
