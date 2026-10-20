package cl.dramapp.backend.auth;

import java.time.Duration;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.ErrorResponseException;

public class TooManyLoginAttemptsException extends ErrorResponseException {

	public TooManyLoginAttemptsException(Duration retryAfter) {
		super(HttpStatus.TOO_MANY_REQUESTS, problem(retryAfter), null);
		getHeaders().set(HttpHeaders.RETRY_AFTER, String.valueOf(seconds(retryAfter)));
	}

	private static ProblemDetail problem(Duration retryAfter) {
		long minutes = Math.max(1, (seconds(retryAfter) + 59) / 60);
		String wait = minutes == 1 ? "1 minuto" : minutes + " minutos";
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS,
				"Demasiados intentos fallidos. Espera " + wait + " e inténtalo de nuevo.");
		problem.setTitle("Demasiados intentos");
		return problem;
	}

	/** Rounded up, so the client never retries a moment too early. */
	private static long seconds(Duration duration) {
		return Math.max(1, duration.plusMillis(999).toSeconds());
	}

}
