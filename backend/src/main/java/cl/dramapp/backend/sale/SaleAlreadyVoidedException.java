package cl.dramapp.backend.sale;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class SaleAlreadyVoidedException extends ErrorResponseException {

	/** The party is in San Bernardo, so the cashier reads Chilean time. */
	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm")
		.withZone(ZoneId.of("America/Santiago"));

	public SaleAlreadyVoidedException(Sale sale) {
		super(HttpStatus.CONFLICT, problem(sale), null);
	}

	private static ProblemDetail problem(Sale sale) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "La venta " + sale.getId()
				+ " ya está anulada (a las " + TIME.format(sale.getVoidedAt()) + ").");
		problem.setTitle("Venta ya anulada");
		return problem;
	}

}
