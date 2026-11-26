package cl.dramapp.backend.point;

/** What the phone shows of an order. It only depends on Mercado Pago's status, never on its detail. */
public enum PointOrderState {

	/** Mercado Pago has not answered: the order may exist or not. */
	SENDING,

	/** Mercado Pago refused it: there is no order. */
	NOT_SENT,

	/** Created, but the Smart has not taken it. */
	SENT,

	/** On the screen of the Smart. */
	WAITING,

	/** Asked to cancel; it may still be paid. */
	CANCELING,

	/** Mercado Pago gives no outcome: look at the Smart. */
	ATTENTION,

	PAID,

	/** Canceled, expired or rejected: nothing was charged. */
	CANCELED

}
