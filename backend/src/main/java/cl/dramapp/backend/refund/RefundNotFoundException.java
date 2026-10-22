package cl.dramapp.backend.refund;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class RefundNotFoundException extends ErrorResponseException {

	public RefundNotFoundException(Long id) {
		super(HttpStatus.NOT_FOUND, problem(id), null);
	}

	private static ProblemDetail problem(Long id) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND,
				"La devolución " + id + " no existe.");
		problem.setTitle("Devolución no encontrada");
		return problem;
	}

}
