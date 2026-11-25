package cl.dramapp.backend.point;

import java.time.Duration;
import java.time.Instant;

import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleStatus;
import cl.dramapp.backend.vale.ValeResponse;

/**
 * @param status as Mercado Pago sends it; null until it answers
 * @param secondsSinceCreated by the backend's clock: the phone's may be wrong
 * @param pendingVerification closed by hand as paid, and Mercado Pago has not shown the payment yet
 * @param vale the sale's last vale; null without one
 */
public record PointOrderResponse(Long saleId, PointOrderState state, String status, String statusDetail, long amount,
		String terminalId, String terminalName, long secondsSinceCreated, boolean cancelRequested,
		SaleStatus saleStatus, String voidReason, boolean pendingVerification, boolean paidOnVoidedSale,
		ValeResponse vale) {

	/** The sale was never sent to a Point. */
	static PointOrderResponse withoutOrder(Sale sale) {
		return new PointOrderResponse(sale.getId(), PointOrderState.NOT_SENT, null, null,
				Math.addExact(sale.getSubtotal(), sale.getTip()), null, null, 0, false, sale.getStatus(),
				sale.getVoidReason(), false, false, null);
	}

	static PointOrderResponse from(PointOrder order, String terminalName, ValeResponse vale) {
		Sale sale = order.getSale();
		return new PointOrderResponse(sale.getId(), order.getState(), order.getStatus(), order.getStatusDetail(),
				order.getAmount(), order.getTerminalId(), terminalName,
				Math.max(0, Duration.between(order.getCreatedAt(), Instant.now()).toSeconds()),
				order.getCancelRequestedAt() != null, sale.getStatus(), sale.getVoidReason(),
				order.isPendingVerification(), order.isPaidOnVoidedSale(), vale);
	}

}
