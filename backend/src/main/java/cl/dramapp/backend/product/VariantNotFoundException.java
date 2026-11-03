package cl.dramapp.backend.product;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** There is no such variant in this product, even if another product has one with that id. */
public class VariantNotFoundException extends ErrorResponseException {

	public VariantNotFoundException(Product product, Long variantId) {
		super(HttpStatus.NOT_FOUND, problem("«" + product.getName() + "» no tiene la variante " + variantId + "."),
				null);
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, detail);
		problem.setTitle("Variante no encontrada");
		return problem;
	}

}
