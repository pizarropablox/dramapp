package cl.dramapp.backend.sale;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class InvalidSaleException extends ErrorResponseException {

	public InvalidSaleException(String detail) {
		super(HttpStatus.BAD_REQUEST, problem(detail), null);
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
		problem.setTitle("Venta inválida");
		return problem;
	}

}
