package cl.dramapp.backend.refund;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class RefundAlreadyVoidedException extends ErrorResponseException {

	/** The party is in San Bernardo, so the cashier reads Chilean time. */
	private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm")
		.withZone(ZoneId.of("America/Santiago"));

	public RefundAlreadyVoidedException(Refund refund) {
		super(HttpStatus.CONFLICT, problem(refund), null);
	}

	private static ProblemDetail problem(Refund refund) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "La devolución "
				+ refund.getId() + " ya está anulada (a las " + TIME.format(refund.getVoidedAt()) + ").");
		problem.setTitle("Devolución ya anulada");
		return problem;
	}

}
