package cl.dramapp.backend.sale;

import java.time.Instant;
import java.util.List;

/**
 * subtotal is the products total; amountToCharge = subtotal + tipAmount.
 * voidedAt and voidReason are null unless status is VOIDED (voidReason may be null even then).
 */
public record SaleResponse(Long id, Long eventId, PaymentMethod paymentMethod, List<SaleLineResponse> lines,
		long subtotal, long tipAmount, long amountToCharge, Instant createdAt, SaleStatus status, Instant voidedAt,
		String voidReason) {

	static SaleResponse from(Sale sale) {
		return new SaleResponse(sale.getId(), sale.getEvent().getId(), sale.getPaymentMethod(),
				sale.getLines().stream().map(SaleLineResponse::from).toList(), sale.getSubtotal(), sale.getTip(),
				Math.addExact(sale.getSubtotal(), sale.getTip()), sale.getCreatedAt(), sale.getStatus(),
				sale.getVoidedAt(), sale.getVoidReason());
	}

}
