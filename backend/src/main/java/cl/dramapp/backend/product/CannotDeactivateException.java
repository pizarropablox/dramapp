package cl.dramapp.backend.product;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** The menu is prepared before the party: nothing leaves it during an event, and a product keeps a variant to sell. */
public class CannotDeactivateException extends ErrorResponseException {

	private CannotDeactivateException(String detail) {
		super(HttpStatus.CONFLICT, problem(detail), null);
	}

	/** What runs out during the night is marked «Sin stock» instead (DRAMA-51). */
	static CannotDeactivateException eventOpen() {
		return new CannotDeactivateException("Hay un evento abierto. Si se acabó esta noche, márcalo Sin stock.");
	}

	static CannotDeactivateException lastActiveVariant(Product product) {
		return new CannotDeactivateException(
				"Es la última variante activa de «" + product.getName() + "»: desactiva el producto.");
	}

	private static ProblemDetail problem(String detail) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, detail);
		problem.setTitle("No se puede desactivar");
		return problem;
	}

}
