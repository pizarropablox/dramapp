package cl.dramapp.backend.point.mp;

/** How Mercado Pago answered a call. No exception is thrown for it: the caller must decide on each case. */
public sealed interface MpResult<T> {

	/** It worked. The value is null for the calls that only answer 2xx. */
	record Ok<T>(T value) implements MpResult<T> {
	}

	/**
	 * A 4xx: Mercado Pago refused this call. It does not prove by itself that nothing exists from an earlier call with
	 * the same key (see {@link Reason#KEY_USED}, or a lost answer before).
	 *
	 * @param code Mercado Pago's error code, or {@code http_<status>}
	 */
	record Rejected<T>(int httpStatus, String code, Reason reason) implements MpResult<T> {
	}

	/** Network, timeout, 5xx, 408, 429 or an answer that cannot be read: it may have worked or not. */
	record NoAnswer<T>(String cause) implements MpResult<T> {
	}

	enum Reason {

		/** The terminal has another order or print waiting. */
		TERMINAL_BUSY,

		/** The idempotency key was used before: an order may exist. */
		KEY_USED,

		/** 401, 403 or 404: wrong token or terminal. */
		NOT_CONFIGURED,

		OTHER

	}

}
