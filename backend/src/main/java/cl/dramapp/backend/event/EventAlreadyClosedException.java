package cl.dramapp.backend.event;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class EventAlreadyClosedException extends ErrorResponseException {

	public EventAlreadyClosedException(Event event) {
		super(HttpStatus.CONFLICT, problem(event), null);
	}

	private static ProblemDetail problem(Event event) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
				"El evento " + event.getId() + " (" + event.getName() + ") ya está cerrado.");
		problem.setTitle("Evento ya cerrado");
		return problem;
	}

}
