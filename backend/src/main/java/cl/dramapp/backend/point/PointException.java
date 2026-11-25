package cl.dramapp.backend.point;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

import cl.dramapp.backend.sale.Sale;

/**
 * Errors of charging with the Point. The phone tells them apart by {@code code}. Never 401 or 403, even when Mercado
 * Pago answers that: a 401 of this API logs the phone out.
 */
public class PointException extends ErrorResponseException {

	private PointException(ProblemDetail problem) {
		super(HttpStatus.valueOf(problem.getStatus()), problem, null);
	}

	private static PointException of(HttpStatus status, String code, String title, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(title);
		problem.setProperty("code", code);
		return new PointException(problem);
	}

	private PointException with(String property, Object value) {
		getBody().setProperty(property, value);
		return this;
	}

	/** The phone chose a terminal that is no longer on the list. */
	public static PointException unknownTerminal() {
		return of(HttpStatus.BAD_REQUEST, "POINT_TERMINAL_UNKNOWN", "Point desconocida",
				"Esa Point no está en la lista. Elige otra en Totales.");
	}

	public static PointException notChargeable(Sale sale, String why) {
		return of(HttpStatus.CONFLICT, "SALE_NOT_CHARGEABLE", "Venta que no se puede cobrar",
				"La venta " + sale.getId() + " no se puede cobrar en la Point: " + why + ".");
	}

	public static PointException orderNotFound(Long saleId) {
		return of(HttpStatus.NOT_FOUND, "POINT_ORDER_NOT_FOUND", "Sin cobro en la Point",
				"La venta " + saleId + " no se ha enviado a la Point.");
	}

	/** The terminal holds another charge, and this app knows which. */
	public static PointException busy(PointOrder open, String terminalName) {
		return of(HttpStatus.CONFLICT, "POINT_BUSY", "Point ocupada",
				"La Point tiene un cobro pendiente: venta " + open.getSale().getId() + ".")
			.with("saleId", open.getSale().getId())
			.with("amount", open.getAmount())
			.with("terminalName", terminalName);
	}

	/** A vale is on its way there: nothing was sent, so the phone just asks again. */
	public static PointException printing(Long saleId) {
		return of(HttpStatus.CONFLICT, "POINT_PRINTING", "Vale en curso", "Esperando que termine el vale de la venta "
				+ saleId + ".")
			.with("saleId", saleId);
	}

	/** A vale the Smart did not take keeps it from charging. */
	public static PointException busyWithVale(Long saleId) {
		return of(HttpStatus.CONFLICT, "POINT_BUSY_VALE", "Point ocupada",
				"La Point está ocupada con el vale de la venta " + saleId + ".")
			.with("saleId", saleId);
	}

	/** Mercado Pago says the terminal is busy, with nothing this app sent. */
	public static PointException busyUnknown() {
		return of(HttpStatus.CONFLICT, "POINT_BUSY_UNKNOWN", "Point ocupada",
				"La Point está ocupada. Si muestra un cobro, cancélalo con la flecha atrás.");
	}

	/** Mercado Pago refused the order for sure. */
	public static PointException rejected(String mpCode) {
		return of(HttpStatus.UNPROCESSABLE_CONTENT, "POINT_ORDER_REJECTED", "Cobro rechazado",
				"Mercado Pago no aceptó el cobro (" + mpCode + ").")
			.with("mpCode", mpCode);
	}

	public static PointException notConfigured() {
		return of(HttpStatus.FAILED_DEPENDENCY, "POINT_NOT_CONFIGURED", "Point sin configurar",
				"La Point no está configurada. Avisa al admin.");
	}

	public static PointException unavailable() {
		return of(HttpStatus.BAD_GATEWAY, "POINT_UNAVAILABLE", "La Point no responde", "La Point no responde.");
	}

	/** The order waits for someone to look at the Smart. */
	public static PointException cannotCancel() {
		return of(HttpStatus.CONFLICT, "POINT_CANNOT_CANCEL", "No se puede cancelar",
				"La Point necesita atención: mira su pantalla.");
	}

	/** Closing by hand is only for when Mercado Pago gives no outcome. */
	public static PointException notClosable() {
		return of(HttpStatus.CONFLICT, "POINT_NOT_CLOSABLE", "El cobro sigue en curso",
				"El cobro sigue en curso en la Point: espera el pago o cancélalo.");
	}

	/** Voiding the sale or closing the event would leave the amount alive on the Smart. */
	public static PointException orderOpen(PointOrder order) {
		return of(HttpStatus.CONFLICT, "POINT_ORDER_OPEN", "Cobro en curso", "La venta " + order.getSale().getId()
				+ " tiene un cobro en curso en la Point. Termínalo o cancélalo primero.")
			.with("saleId", order.getSale().getId());
	}

	/** An answer was lost before: this one does not prove that the order does not exist. */
	public static PointException uncertain() {
		return of(HttpStatus.CONFLICT, "POINT_UNCERTAIN", "Cobro sin confirmar",
				"No se sabe si el cobro llegó a la Point. Mira su pantalla.");
	}

}
