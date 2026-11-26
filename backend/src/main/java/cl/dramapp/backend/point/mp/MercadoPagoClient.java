package cl.dramapp.backend.point.mp;

import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * Mercado Pago's API for the Point Smart. Calls take seconds, so they are never made inside a database transaction:
 * that would hold one of the 5 connections of production.
 */
public interface MercadoPagoClient {

	/**
	 * Sends a charge to a terminal. Repeating the same key and body answers the order as it was first created, not its
	 * current status: read it with {@link #getOrder}.
	 *
	 * @param key idempotency key and external reference of the order
	 * @param amount whole pesos
	 */
	MpResult<MpOrder> createOrder(String key, String terminalId, long amount);

	MpResult<MpOrder> getOrder(String orderId);

	/** Asks to cancel. On the terminal it is not canceled yet: only {@link #getOrder} tells. */
	MpResult<Void> cancelOrder(String orderId);

	/** Prints on a terminal. Never call it twice for the same paper: nothing stops a second one. */
	MpResult<MpPrint> createPrint(String reference, String terminalId, String content);

	MpResult<MpPrint> getPrint(String printId);

	/** Only works while the print is {@code created}. Confirm with {@link #getPrint}. */
	MpResult<Void> cancelPrint(String printId);

	/** Every implementation calls it first. */
	static void requireNoTransaction() {
		if (TransactionSynchronizationManager.isActualTransactionActive()) {
			throw new IllegalStateException("Mercado Pago must not be called inside a transaction");
		}
	}

}
