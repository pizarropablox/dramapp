package cl.dramapp.backend.point;

/**
 * A sale whose charge someone must look at.
 *
 * @param amount what was charged on the Point
 * @param pendingVerification closed by hand as paid, and Mercado Pago has not shown the payment
 * @param paidOnVoidedSale a payment came in for a voided sale
 */
public record PointSaleMark(Long saleId, long amount, boolean pendingVerification, boolean paidOnVoidedSale) {

	static PointSaleMark from(PointOrder order) {
		return new PointSaleMark(order.getSale().getId(), order.getAmount(), order.isPendingVerification(),
				order.isPaidOnVoidedSale());
	}

}
