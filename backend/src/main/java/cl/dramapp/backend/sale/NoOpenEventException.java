package cl.dramapp.backend.sale;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class NoOpenEventException extends ErrorResponseException {

	public NoOpenEventException() {
		this("No hay un evento abierto. Abre un evento antes de registrar ventas.");
	}

	/** For other records that need an open event, e.g. refunds. */
	public NoOpenEventException(String detail) {
		super(HttpStatus.CONFLICT, problem(detail), null);
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
		problem.setTitle("Sin evento abierto");
		return problem;
	}

}
