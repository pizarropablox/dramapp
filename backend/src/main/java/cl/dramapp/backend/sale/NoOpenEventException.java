package cl.dramapp.backend.sale;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class NoOpenEventException extends ErrorResponseException {

	public NoOpenEventException() {
		super(HttpStatus.CONFLICT, problem(), null);
	}

	private static ProblemDetail problem() {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
				"No hay un evento abierto. Abre un evento antes de registrar ventas.");
		problem.setTitle("Sin evento abierto");
		return problem;
	}

}
