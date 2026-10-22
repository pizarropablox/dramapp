package cl.dramapp.backend.refund;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

import cl.dramapp.backend.event.Event;

/** Refunds can only be voided while their event is open. */
public class RefundEventClosedException extends ErrorResponseException {

	public RefundEventClosedException(Event event) {
		super(HttpStatus.CONFLICT, problem(event), null);
	}

	private static ProblemDetail problem(Event event) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
				"El evento " + event.getName() + " ya está cerrado: no se pueden anular sus devoluciones.");
		problem.setTitle("Evento cerrado");
		return problem;
	}

}
