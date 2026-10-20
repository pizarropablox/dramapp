package cl.dramapp.backend;

import static org.assertj.core.api.Assertions.assertThat;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import com.zaxxer.hikari.HikariDataSource;

import cl.dramapp.backend.auth.SessionCookies;

/**
 * The prod profile starts (Flyway included) and keeps no idle connections, so Neon can scale to zero. Its login
 * settings are built here at run time, like Render's variables: no hash or secret is stored in the repo.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("prod")
class ProductionProfileTests extends PostgresIntegrationTest {

	@Autowired
	private DataSource dataSource;

	@Autowired
	private Environment environment;

	@Autowired
	private SessionCookies sessionCookies;

	@Autowired
	private MockMvcTester mvc;

	@DynamicPropertySource
	static void productionSecrets(DynamicPropertyRegistry registry) {
		byte[] secret = new byte[32];
		new SecureRandom().nextBytes(secret);
		BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder(4);
		registry.add("dramapp.auth.jwt-secret", () -> Base64.getEncoder().encodeToString(secret));
		// htpasswd (README) writes $2y$ hashes; Spring's $2a$ are the same algorithm.
		registry.add("dramapp.auth.barra-password",
				() -> "{bcrypt}" + bcrypt.encode(BARRA_PASSWORD).replaceFirst("^\\$2a\\$", "\\$2y\\$"));
		registry.add("dramapp.auth.admin-password", () -> "{bcrypt}" + bcrypt.encode(ADMIN_PASSWORD));
	}

	@Test
	void keepsASmallPoolWithoutIdleConnections() {
		HikariDataSource hikari = (HikariDataSource) dataSource;

		assertThat(hikari.getMaximumPoolSize()).isEqualTo(5);
		assertThat(hikari.getMinimumIdle()).isZero();
		assertThat(hikari.getIdleTimeout()).isEqualTo(120_000);
	}

	@Test
	void shutsDownGracefullyWithFewThreads() {
		assertThat(environment.getProperty("server.shutdown")).isEqualTo("graceful");
		assertThat(environment.getProperty("server.tomcat.threads.max", Integer.class)).isEqualTo(20);
	}

	@Test
	void logsInWithBcryptPasswords() {
		var result = mvc.post().uri("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("""
				{"username": "barra", "password": "%s"}""".formatted(BARRA_PASSWORD)).exchange();

		assertThat(result).hasStatus(HttpStatus.OK);
	}

	@Test
	void theSessionCookieIsHttpsOnly() {
		assertThat(sessionCookies.create("token", Instant.now().plusSeconds(60)).isSecure()).isTrue();
	}

	@Test
	void readsTheClientAddressFromRendersProxyHeaders() {
		assertThat(environment.getProperty("server.forward-headers-strategy")).isEqualTo("native");
	}

}
