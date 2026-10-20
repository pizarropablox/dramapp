package cl.dramapp.backend.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import cl.dramapp.backend.PostgresIntegrationTest;

/** What Render and UptimeRobot rely on: the liveness probe and uncached API answers. */
@SpringBootTest
@AutoConfigureMockMvc
class DeploymentEndpointsTests extends PostgresIntegrationTest {

	@Autowired
	private MockMvcTester mvc;

	@Test
	void livenessIsUpAndDoesNotIncludeTheDatabase() {
		// No session: Render's health check and UptimeRobot don't log in.
		var result = mvc.get().uri("/actuator/health/liveness").exchange();

		// Only the liveness state: the full /actuator/health checks the database, this group must not,
		// so Render's and UptimeRobot's pings let Neon scale to zero.
		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().isStrictlyEqualTo("""
				{"status": "UP"}""");
	}

	@Test
	@WithMockUser(roles = "BARRA")
	void apiAnswersAreNeverCached() {
		var result = mvc.get().uri("/api/products").exchange();

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).hasHeader(HttpHeaders.CACHE_CONTROL, "no-store");
	}

	@Test
	@WithMockUser(roles = "BARRA")
	void apiErrorsAreNeverCachedEither() {
		var result = mvc.get().uri("/api/events/999999999/summary").exchange();

		assertThat(result).hasStatus(HttpStatus.NOT_FOUND);
		assertThat(result).hasHeader(HttpHeaders.CACHE_CONTROL, "no-store");
	}

	@Test
	void unauthorizedAnswersAreNeverCachedEither() {
		var result = mvc.get().uri("/api/products").exchange();

		assertThat(result).hasStatus(HttpStatus.UNAUTHORIZED);
		assertThat(result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).contains("no-store");
	}

	@Test
	void actuatorIsNotTouchedByTheApiFilter() {
		var result = mvc.get().uri("/actuator/health/liveness").exchange();

		assertThat(result.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).isNotEqualTo("no-store");
	}

}
