package cl.dramapp.backend.product;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Variant names are unique within their product, deactivated ones included (ux_product_variant_product_name). */
public class VariantNameTakenException extends ErrorResponseException {

	private VariantNameTakenException(String detail, Throwable cause) {
		super(HttpStatus.CONFLICT, problem(detail), cause);
	}

	/** «Jack Daniels» ya tiene la variante «Manzana».» */
	static VariantNameTakenException of(Product product, ProductVariant existing) {
		return new VariantNameTakenException("«" + product.getName() + "» ya tiene la variante «"
				+ existing.getName() + "»" + (existing.isActive() ? "." : " (desactivada)."), null);
	}

	/** Another phone added it in the meantime. */
	static VariantNameTakenException concurrent(Throwable cause) {
		return new VariantNameTakenException("El producto ya tiene una variante con ese nombre.", cause);
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
		problem.setTitle("Variante en uso");
		return problem;
	}

}
