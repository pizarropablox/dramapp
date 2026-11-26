package cl.dramapp.backend.vale;

/** What the phone shows of a vale. */
public enum ValeState {

	/** Being sent, or accepted and not taken by the Smart yet. */
	PENDING,

	/** Coming out, or in a status nobody documented. */
	PRINTING,

	PRINTED,

	/** Mercado Pago refused it for sure: nothing came out. */
	REJECTED,

	/** Expired or canceled before coming out. */
	GONE,

	/** The answer was lost: it may have come out. */
	UNKNOWN

}
