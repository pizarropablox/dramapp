package cl.dramapp.backend.product;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class InvalidProductException extends ErrorResponseException {

	public InvalidProductException(String detail) {
		super(HttpStatus.BAD_REQUEST, problem(detail), null);
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
		problem.setTitle("Producto inválido");
		return problem;
	}

}
