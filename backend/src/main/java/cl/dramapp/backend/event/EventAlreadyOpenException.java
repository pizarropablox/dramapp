package cl.dramapp.backend.event;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class EventAlreadyOpenException extends ErrorResponseException {

	public EventAlreadyOpenException(String openEventName) {
		super(HttpStatus.CONFLICT, problem("Ya hay un evento abierto (" + openEventName
				+ "). Ciérralo antes de crear otro."), null);
	}

	public EventAlreadyOpenException(Throwable cause) {
		super(HttpStatus.CONFLICT, problem("Ya hay un evento abierto. Ciérralo antes de crear otro."), cause);
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
		problem.setTitle("Evento ya abierto");
		return problem;
	}

}
