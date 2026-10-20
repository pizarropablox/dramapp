package cl.dramapp.backend.auth;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

/** Same answer for an unknown user and a wrong password. */
public class InvalidCredentialsException extends ErrorResponseException {

	public InvalidCredentialsException() {
		super(HttpStatus.UNAUTHORIZED, problem(), null);
	}

	private static ProblemDetail problem() {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED,
				"Usuario o contraseña incorrectos.");
		problem.setTitle("Credenciales inválidas");
		return problem;
	}

}
