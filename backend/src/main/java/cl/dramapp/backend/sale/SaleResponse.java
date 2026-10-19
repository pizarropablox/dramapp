package cl.dramapp.backend.sale;

import java.time.Instant;
import java.util.List;

/** subtotal is the products total; amountToCharge = subtotal + tipAmount. */
public record SaleResponse(Long id, Long eventId, PaymentMethod paymentMethod, List<SaleLineResponse> lines,
		long subtotal, long tipAmount, long amountToCharge, Instant createdAt) {

	static SaleResponse from(Sale sale) {
		return new SaleResponse(sale.getId(), sale.getEvent().getId(), sale.getPaymentMethod(),
				sale.getLines().stream().map(SaleLineResponse::from).toList(), sale.getSubtotal(), sale.getTip(),
				Math.addExact(sale.getSubtotal(), sale.getTip()), sale.getCreatedAt());
	}

}
