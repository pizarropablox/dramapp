package cl.dramapp.backend.sale;

/** Something that may forbid voiding a sale by hand, checked with the sale locked. */
public interface SaleVoidGuard {

	/** Throws when the sale must not be voided now. */
	void beforeVoid(Sale sale);

}
