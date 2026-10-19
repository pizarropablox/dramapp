package cl.dramapp.backend.event;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class EventNotFoundException extends ErrorResponseException {

	private EventNotFoundException(String title, String detail) {
		super(HttpStatus.NOT_FOUND, problem(title, detail), null);
	}

	public static EventNotFoundException byId(Long id) {
		return new EventNotFoundException("Evento no encontrado", "El evento " + id + " no existe.");
	}

	public static EventNotFoundException noOpenEvent() {
		return new EventNotFoundException("Sin evento abierto", "No hay un evento abierto.");
	}

	public static EventNotFoundException noEvents() {
		return new EventNotFoundException("Sin eventos", "No hay eventos todavía.");
	}

	private static ProblemDetail problem(String title, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, detail);
		problem.setTitle(title);
		return problem;
	}

}
