package cl.dramapp.backend.sale;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/**
 * A line of the sale is «Agotado» (DRAMA-51): nothing is registered and the cashier decides with the customer.
 * POST /api/sales also answers 409 when no event is open: the frontend tells them apart by {@link #CODE}.
 */
public class OutOfStockSaleException extends ErrorResponseException {

	public static final String CODE = "OUT_OF_STOCK";

	/**
	 * @param names what the sale asked for and ran out, as the cashier reads it
	 * @param affectedVariantIds the same lines, by id
	 * @param outOfStockVariantIds everything that is out in the event, so the phone updates its grid
	 */
	public OutOfStockSaleException(List<String> names, List<Long> affectedVariantIds,
			List<Long> outOfStockVariantIds) {
		super(HttpStatus.CONFLICT, problem(names, affectedVariantIds, outOfStockVariantIds), null);
	}

	private static ProblemDetail problem(List<String> names, List<Long> affectedVariantIds,
			List<Long> outOfStockVariantIds) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
				"Se acabó: " + String.join(", ", names));
		problem.setTitle("Agotado");
		problem.setProperty("code", CODE);
		problem.setProperty("affectedVariantIds", affectedVariantIds);
		problem.setProperty("outOfStockVariantIds", outOfStockVariantIds);
		return problem;
	}

}
