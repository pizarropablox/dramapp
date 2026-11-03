package cl.dramapp.backend.product;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Names are unique among all products, deactivated ones included (ux_product_name). */
public class ProductNameTakenException extends ErrorResponseException {

	private ProductNameTakenException(String detail, Throwable cause) {
		super(HttpStatus.CONFLICT, problem(detail), cause);
	}

	/** «Ya existe «Piscola» (desactivado).» */
	static ProductNameTakenException of(Product existing) {
		return new ProductNameTakenException(
				"Ya existe «" + existing.getName() + "»" + (existing.isActive() ? "." : " (desactivado)."), null);
	}

	/** Another phone added it in the meantime. */
	static ProductNameTakenException concurrent(Throwable cause) {
		return new ProductNameTakenException("Ya existe un producto con ese nombre.", cause);
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
		problem.setTitle("Nombre en uso");
		return problem;
	}

}
