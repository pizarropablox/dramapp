package cl.dramapp.backend.summary;

import java.util.List;

import cl.dramapp.backend.event.EventResponse;
import cl.dramapp.backend.sale.PaymentMethod;

/**
 * Totals of an event. Voided sales count in nothing but {@code voided}.
 * <p>
 * sold is the products total (promos applied), tips the tips, total = sold + tips. Each payment method's total is
 * what gets compared with Mercado Pago or with the cash box. Amounts are whole pesos.
 */
public record EventSummaryResponse(EventResponse event, List<PaymentMethodTotals> byPaymentMethod, Totals overall,
		VoidedTotals voided, List<ProductUnits> products) {

	/** Always present for both payment methods, Mercado Pago first, even when zero. */
	public record PaymentMethodTotals(PaymentMethod paymentMethod, long salesCount, long sold, long tips, long total) {
	}

	public record Totals(long salesCount, long sold, long tips, long total) {
	}

	/** Control data: amount is what had been charged (products + tip). */
	public record VoidedTotals(long count, long amount, List<VoidedByPaymentMethod> byPaymentMethod) {
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
