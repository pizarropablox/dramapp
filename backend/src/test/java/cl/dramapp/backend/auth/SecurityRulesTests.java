package cl.dramapp.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;

import java.util.stream.Stream;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.PostgresIntegrationTest;

/**
 * The authorization table of DRAMA-27, endpoint by endpoint, for an anonymous caller, barra and admin. Sessions are
 * real tokens (Bearer header, so no CSRF token is involved; the cookie path is covered in AuthControllerTests).
 * <p>
 * Allowed calls may still fail for other reasons (no body, unknown id): only 401 and 403 mean "not allowed".
 */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class SecurityRulesTests extends PostgresIntegrationTest {

	enum Access {

		PUBLIC, BARRA, ADMIN, NOBODY

	}

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JwtService jwtService;

	static Stream<Arguments> endpoints() {
		return Stream.of(
				Arguments.of(POST, "/api/auth/login", Access.PUBLIC),
				Arguments.of(POST, "/api/auth/logout", Access.PUBLIC),
				Arguments.of(GET, "/actuator/health/liveness", Access.PUBLIC),

				Arguments.of(GET, "/api/auth/me", Access.BARRA),
				Arguments.of(GET, "/api/products", Access.BARRA),
				Arguments.of(GET, "/api/events/current", Access.BARRA),
				Arguments.of(GET, "/api/events/latest/summary", Access.BARRA),
				Arguments.of(GET, "/api/events/999999/summary", Access.BARRA),
				Arguments.of(GET, "/api/sales", Access.BARRA),
				Arguments.of(POST, "/api/sales", Access.BARRA),
				Arguments.of(POST, "/api/sales/999999/void", Access.BARRA),

				Arguments.of(POST, "/api/events", Access.ADMIN),
				Arguments.of(POST, "/api/events/999999/close", Access.ADMIN),
				Arguments.of(POST, "/api/products", Access.ADMIN),
				Arguments.of(GET, "/api/system/status", Access.ADMIN),
				Arguments.of(GET, "/actuator/health", Access.ADMIN),

				Arguments.of(GET, "/api/unknown", Access.NOBODY),
				Arguments.of(POST, "/api/events/current", Access.NOBODY),
				Arguments.of(GET, "/", Access.NOBODY));
	}

	@ParameterizedTest(name = "{0} {1} → {2}")
	@MethodSource("endpoints")
	void anonymousCallers(HttpMethod method, String uri, Access access) {
		var result = call(method, uri, null);

		if (access == Access.PUBLIC) {
			assertAllowed(result);
		}
		else {
			assertThat(result).hasStatus(HttpStatus.UNAUTHORIZED)
				.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
			assertThat(result).bodyJson().extractingPath("$.detail").isEqualTo(SecurityProblems.SESSION_EXPIRED);
		}
	}

	@ParameterizedTest(name = "{0} {1} → {2}")
	@MethodSource("endpoints")
	void barra(HttpMethod method, String uri, Access access) {
		var result = call(method, uri, Role.BARRA);

		if (access == Access.PUBLIC || access == Access.BARRA) {
			assertAllowed(result);
		}
		else {
			assertForbidden(result);
		}
	}

	@ParameterizedTest(name = "{0} {1} → {2}")
	@MethodSource("endpoints")
	void admin(HttpMethod method, String uri, Access access) {
		var result = call(method, uri, Role.ADMIN);

		if (access == Access.NOBODY) {
			assertForbidden(result);
		}
		else {
			assertAllowed(result);
		}
	}

	private MvcTestResult call(HttpMethod method, String uri, Role role) {
		var request = mvc.method(method).uri(uri).contentType(MediaType.APPLICATION_JSON).content("{}");
		if (role != null) {
			String token = jwtService.issue(role.username(), role).value();
			request.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
		}
		return request.exchange();
	}

	private static void assertAllowed(MvcTestResult result) {
		assertThat(result.getResponse().getStatus()).isNotIn(HttpStatus.UNAUTHORIZED.value(),
				HttpStatus.FORBIDDEN.value());
	}

	private static void assertForbidden(MvcTestResult result) {
		assertThat(result).hasStatus(HttpStatus.FORBIDDEN)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.detail").isEqualTo(SecurityProblems.FORBIDDEN);
	}

}
