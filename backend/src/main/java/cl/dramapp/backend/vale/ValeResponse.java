package cl.dramapp.backend.vale;

/**
 * The last vale of a sale.
 *
 * @param error Mercado Pago's code, only when {@code REJECTED}
 * @param busy it was rejected because the Smart has a charge or another vale
 * @param mayBeDouble a reprint whose previous paper came out, or may have
 */
public record ValeResponse(Long saleId, ValeState state, ValePrintKind kind, String terminalId, String terminalName,
		String error, boolean busy, boolean mayBeDouble, long secondsSinceRequested) {
}
