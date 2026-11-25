package cl.dramapp.backend.point;

import java.time.Duration;
import java.time.Instant;

import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleStatus;

/**
 * @param status as Mercado Pago sends it; null until it answers
 * @param secondsSinceCreated by the backend's clock: the phone's may be wrong
 * @param pendingVerification closed by hand as paid, and Mercado Pago has not shown the payment yet
 */
public record PointOrderResponse(Long saleId, PointOrderState state, String status, String statusDetail, long amount,
		String terminalId, String terminalName, long secondsSinceCreated, boolean cancelRequested,
		SaleStatus saleStatus, String voidReason, boolean pendingVerification, boolean paidOnVoidedSale) {

	static PointOrderResponse from(PointOrder order, String terminalName) {
		Sale sale = order.getSale();
		return new PointOrderResponse(sale.getId(), order.getState(), order.getStatus(), order.getStatusDetail(),
				order.getAmount(), order.getTerminalId(), terminalName,
				Math.max(0, Duration.between(order.getCreatedAt(), Instant.now()).toSeconds()),
				order.getCancelRequestedAt() != null, sale.getStatus(), sale.getVoidReason(),
				order.isPendingVerification(), order.isPaidOnVoidedSale());
	}

}
