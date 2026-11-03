package cl.dramapp.backend.product;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** A variant cannot be added to this product (yet): it is deactivated, or it has no variants ("Única"). */
public class VariantNotAllowedException extends ErrorResponseException {

	private VariantNotAllowedException(String detail) {
		super(HttpStatus.CONFLICT, problem(detail), null);
	}

	static VariantNotAllowedException inactive(Product product) {
		return new VariantNotAllowedException("«" + product.getName() + "» está desactivado.");
	}

	/** Until DRAMA-28 can rename "Única", it would end up next to the new variant. */
	static VariantNotAllowedException singleVariant() {
		return new VariantNotAllowedException(
				"Este producto no tiene variantes. Podrás agregarlas cuando se pueda editar el producto.");
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
		problem.setTitle("No se puede agregar la variante");
		return problem;
	}

}
