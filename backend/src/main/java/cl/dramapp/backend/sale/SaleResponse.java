package cl.dramapp.backend.sale;

import java.time.Instant;
import java.util.List;

public record SaleResponse(Long id, Long eventId, PaymentMethod paymentMethod, List<SaleLineResponse> lines,
		long subtotal, long tip, long total, Instant createdAt) {

	static SaleResponse from(Sale sale) {
		return new SaleResponse(sale.getId(), sale.getEvent().getId(), sale.getPaymentMethod(),
				sale.getLines().stream().map(SaleLineResponse::from).toList(), sale.getSubtotal(), sale.getTip(),
				sale.getSubtotal() + sale.getTip(), sale.getCreatedAt());
	}

}
