package cl.dramapp.backend.sale;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class SaleNotFoundException extends ErrorResponseException {

	public SaleNotFoundException(Long id) {
		super(HttpStatus.NOT_FOUND, problem(id), null);
	}

	private static ProblemDetail problem(Long id) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "La venta " + id + " no existe.");
		problem.setTitle("Venta no encontrada");
		return problem;
	}

}
