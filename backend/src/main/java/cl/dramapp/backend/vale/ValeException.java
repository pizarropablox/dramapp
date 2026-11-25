package cl.dramapp.backend.vale;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Errors of printing vales. The phone tells them apart by {@code code}. */
public class ValeException extends ErrorResponseException {

	private ValeException(HttpStatus status, String code, String title, String detail) {
		super(status, problem(status, code, title, detail), null);
	}

	private static ProblemDetail problem(HttpStatus status, String code, String title, String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
		problem.setTitle(title);
		problem.setProperty("code", code);
		return problem;
	}

	static ValeException notAllowed(String why) {
		return new ValeException(HttpStatus.CONFLICT, "VALE_NOT_ALLOWED", "Vale no permitido",
				"No se puede imprimir el vale: " + why + ".");
	}

	static ValeException notFound(Long saleId) {
		return new ValeException(HttpStatus.NOT_FOUND, "VALE_NOT_FOUND", "Sin vale",
				"La venta " + saleId + " no tiene vale.");
	}

	/** Another vale came out of that Smart later. */
	static ValeException notLatest() {
		return new ValeException(HttpStatus.CONFLICT, "VALE_NOT_LATEST", "No es el último vale",
				"Solo se reimprime el último vale de la Point.");
	}

	/** It is coming out: the phone asks again in a moment. */
	static ValeException printing() {
		return new ValeException(HttpStatus.CONFLICT, "VALE_PRINTING", "Vale en curso",
				"El vale anterior todavía está saliendo.");
	}

	/** The previous vale waits for the Smart and could not be canceled: another one would be refused. */
	static ValeException stuck() {
		return new ValeException(HttpStatus.CONFLICT, "VALE_STUCK", "Point ocupada",
				"La Point está ocupada con el vale anterior.");
	}

}
