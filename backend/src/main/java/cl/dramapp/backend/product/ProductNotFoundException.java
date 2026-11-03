package cl.dramapp.backend.product;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class ProductNotFoundException extends ErrorResponseException {

	public ProductNotFoundException(Long id) {
		super(HttpStatus.NOT_FOUND, problem("El producto " + id + " no existe."), null);
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, detail);
		problem.setTitle("Producto no encontrado");
		return problem;
	}

}
