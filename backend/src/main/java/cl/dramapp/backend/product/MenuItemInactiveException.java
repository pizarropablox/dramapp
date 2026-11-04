package cl.dramapp.backend.product;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Deactivated products and variants are not edited, nor the variants of a deactivated product: reactivate it first. */
public class MenuItemInactiveException extends ErrorResponseException {

	private MenuItemInactiveException(String detail) {
		super(HttpStatus.CONFLICT, problem(detail), null);
	}

	static MenuItemInactiveException of(Product product) {
		return new MenuItemInactiveException("«" + product.getName() + "» está desactivado.");
	}

	static MenuItemInactiveException of(ProductVariant variant) {
		return new MenuItemInactiveException("La variante «" + variant.getName() + "» está desactivada.");
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
		problem.setTitle("No se puede editar");
		return problem;
	}

}
