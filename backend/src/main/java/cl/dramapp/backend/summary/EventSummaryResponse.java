package cl.dramapp.backend.summary;

import java.util.List;

import cl.dramapp.backend.event.EventResponse;
import cl.dramapp.backend.sale.PaymentMethod;

/**
 * Totals of an event. Voided sales count in nothing but {@code voided}; voided refunds, in nothing but
 * {@code refunds}.
 * <p>
 * sold is the products total (promos applied), tips the tips, total = sold + tips: what was charged. Active refunds
 * (cash given back from the till) come off EFECTIVO only, so expected = total - refunds is what gets compared with
 * Mercado Pago or with the cash box, and may be negative for EFECTIVO. Amounts are whole pesos.
 */
public record EventSummaryResponse(EventResponse event, List<PaymentMethodTotals> byPaymentMethod, Totals overall,
		VoidedTotals voided, RefundTotals refunds, List<ProductUnits> products) {

	/** Always present for both payment methods, Mercado Pago first, even when zero. refunds is 0 for Mercado Pago. */
	public record PaymentMethodTotals(PaymentMethod paymentMethod, long salesCount, long sold, long tips, long total,
			long refunds, long expected) {
	}

	/** expected = total - refunds, the sum of both payment methods' expected. */
	public record Totals(long salesCount, long sold, long tips, long total, long refunds, long expected) {
	}

	/** Control data: amount is what had been charged (products + tip). */
	public record VoidedTotals(long count, long amount, List<VoidedByPaymentMethod> byPaymentMethod) {
	}

	/** Control data: active refunds (count, amount) and voided ones, which count in nothing else. */
	public record RefundTotals(long count, long amount, long voidedCount, long voidedAmount) {
	}

	/** Always present for both payment methods, Mercado Pago first, even when zero. */
	public record VoidedByPaymentMethod(PaymentMethod paymentMethod, long count, long amount) {
	}

	/** Products and their variants, most units first. */
	public record ProductUnits(Long productId, String productName, long units, List<VariantUnits> variants) {
	}

	public record VariantUnits(Long variantId, String variantName, long units) {
	}

}
