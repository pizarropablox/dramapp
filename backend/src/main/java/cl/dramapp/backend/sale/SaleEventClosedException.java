package cl.dramapp.backend.sale;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

import cl.dramapp.backend.event.Event;

/** Sales can only be voided while their event is open. */
public class SaleEventClosedException extends ErrorResponseException {

	public SaleEventClosedException(Event event) {
		super(HttpStatus.CONFLICT, problem(event), null);
	}

	private static ProblemDetail problem(Event event) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
				"El evento " + event.getName() + " ya está cerrado: no se pueden anular sus ventas.");
		problem.setTitle("Evento cerrado");
		return problem;
	}

}
