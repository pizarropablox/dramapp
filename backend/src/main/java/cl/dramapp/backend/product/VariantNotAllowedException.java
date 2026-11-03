package cl.dramapp.backend.product;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** A variant cannot be added to this product: it is deactivated. */
public class VariantNotAllowedException extends ErrorResponseException {

	private VariantNotAllowedException(String detail) {
		super(HttpStatus.CONFLICT, problem(detail), null);
	}

	static VariantNotAllowedException inactive(Product product) {
		return new VariantNotAllowedException("«" + product.getName() + "» está desactivado.");
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
		problem.setTitle("No se puede agregar la variante");
		return problem;
	}

}
