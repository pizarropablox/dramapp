package cl.dramapp.backend;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Base for tests that need the database: a throwaway PostgreSQL 17 in Docker (same image as docker-compose.yml),
 * migrated by Flyway when the Spring context starts. Docker must be running.
 * <p>
 * One container for the whole test run: the field is static and started once here, so every test class (and every
 * cached Spring context) shares it. No @Testcontainers/@Container on purpose, as they would restart it per class.
 * Testcontainers' Ryuk removes it when the JVM exits. Each run starts from the migrations only (the official menu,
 * no events or sales), and tests roll back with @Transactional.
 * <p>
 * Login users with test-only passwords, overriding anything a developer's .env sets. The JWT secret is empty: each
 * Spring context signs with its own random key.
 */
@TestPropertySource(properties = { "dramapp.auth.barra-password={noop}" + PostgresIntegrationTest.BARRA_PASSWORD,
		"dramapp.auth.admin-password={noop}" + PostgresIntegrationTest.ADMIN_PASSWORD, "dramapp.auth.jwt-secret=" })
public abstract class PostgresIntegrationTest {

	public static final String BARRA_PASSWORD = "barra-test-password";

	public static final String ADMIN_PASSWORD = "admin-test-password";

	@ServiceConnection
	static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17");

	static {
		postgres.start();
	}

}
