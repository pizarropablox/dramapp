package cl.dramapp.backend.auth;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import tools.jackson.databind.json.JsonMapper;

/**
 * 401 and 403 from the security filters, as the same ProblemDetail JSON the controllers answer (these never reach
 * ApiExceptionHandler). The frontend shows {@code detail} and goes back to the login on 401.
 */
@Component
class SecurityProblems {

	static final String SESSION_EXPIRED = "Tu sesión expiró. Inicia sesión de nuevo.";

	static final String FORBIDDEN = "No tienes permiso para esta acción.";

	static final String CSRF_REJECTED = "La página quedó desactualizada. Recárgala e inténtalo de nuevo.";

	private final JsonMapper jsonMapper;

	SecurityProblems(JsonMapper jsonMapper) {
		this.jsonMapper = jsonMapper;
	}

	AuthenticationEntryPoint authenticationEntryPoint() {
		return (request, response, ex) -> write(request, response, HttpStatus.UNAUTHORIZED, "Sesión requerida",
				SESSION_EXPIRED);
	}

	AccessDeniedHandler accessDeniedHandler() {
		return (request, response, ex) -> {
			if (ex instanceof CsrfException) {
				write(request, response, HttpStatus.FORBIDDEN, "Solicitud rechazada", CSRF_REJECTED);
			}
			else {
				write(request, response, HttpStatus.FORBIDDEN, "Sin permiso", FORBIDDEN);
			}
		};
	}

	private void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String title,
			String detail) throws IOException {
		Map<String, Object> problem = new LinkedHashMap<>();
		problem.put("type", "about:blank");
		problem.put("title", title);
		problem.put("status", status.value());
		problem.put("detail", detail);
		problem.put("instance", request.getRequestURI());
		response.setStatus(status.value());
		response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
		response.setCharacterEncoding("UTF-8");
		jsonMapper.writeValue(response.getOutputStream(), problem);
	}

}
