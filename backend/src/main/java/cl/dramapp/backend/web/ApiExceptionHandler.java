package cl.dramapp.backend.web;

import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** Renders API errors (body and parameter validation, unreadable JSON, ErrorResponseException) as ProblemDetail. */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

	@Override
	protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		List<String> errors = ex.getBindingResult().getFieldErrors().stream()
			.map(error -> error.getField() + ": " + error.getDefaultMessage())
			.toList();
		return invalidRequest(ex.getBody(), errors, ex, headers, status, request);
	}

	@Override
	protected ResponseEntity<Object> handleHandlerMethodValidationException(HandlerMethodValidationException ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		List<String> errors = ex.getParameterValidationResults().stream()
			.flatMap(result -> result.getResolvableErrors().stream()
				.map(error -> result.getMethodParameter().getParameterName() + ": " + error.getDefaultMessage()))
			.toList();
		return invalidRequest(ex.getBody(), errors, ex, headers, status, request);
	}

	private ResponseEntity<Object> invalidRequest(ProblemDetail problem, List<String> errors, Exception ex,
			HttpHeaders headers, HttpStatusCode status, WebRequest request) {
		problem.setDetail("La solicitud tiene datos inválidos: " + String.join("; ", errors));
		problem.setProperty("errors", errors);
		return handleExceptionInternal(ex, problem, headers, status, request);
	}

}
