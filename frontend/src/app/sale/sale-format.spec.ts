import { SaleResponse } from './sale';
import {
  REFUND_VOIDED_NOTICE,
  refundNotice,
  SALE_VOIDED_NOTICE,
  saleSummary,
  voidQuestion,
} from './sale-format';

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
  it('summarizes lines, leaving out the single-variant name', () => {
    expect(
      saleSummary([
        {
          variantId: 91,
          variantName: 'Original',
          productId: 9,
          productName: 'Jack Daniels',
          quantity: 2,
        },
        {
          variantId: 121,
          variantName: 'Única',
          productId: 12,
          productName: 'Red Bull',
          quantity: 1,
        },
      ]),
    ).toBe('2× Jack Daniels Original · 1× Red Bull');
  });

  it('asks with the amount charged, tip included, and the payment method', () => {
    expect(voidQuestion(SALE)).toBe('¿Anular venta de $8.000 (Efectivo)?');
    expect(voidQuestion({ ...SALE, paymentMethod: 'MERCADO_PAGO' })).toBe(
      '¿Anular venta de $8.000 (Mercado Pago)?',
    );
  });

  it('confirms a void without asking to move money', () => {
    expect(SALE_VOIDED_NOTICE).toBe('Venta anulada.');
  });

  it('repeats the amount to hand over once a refund is recorded', () => {
    expect(refundNotice(15000)).toBe('Devolución registrada. Entrega $15.000 de la caja.');
    expect(REFUND_VOIDED_NOTICE).toBe('Devolución anulada.');
  });
});
