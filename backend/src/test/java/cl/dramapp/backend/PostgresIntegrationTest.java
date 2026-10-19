package cl.dramapp.backend;

import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * Base for tests that need the database: a throwaway PostgreSQL 17 in Docker (same image as docker-compose.yml),
 * migrated by Flyway when the Spring context starts. Docker must be running.
 * <p>
 * One container for the whole test run: the field is static and started once here, so every test class (and every
 * cached Spring context) shares it. No @Testcontainers/@Container on purpose, as they would restart it per class.
 * Testcontainers' Ryuk removes it when the JVM exits. Each run starts from the migrations only (the official menu,
 * no events or sales), and tests roll back with @Transactional.
 */
public abstract class PostgresIntegrationTest {

	@ServiceConnection
	static final PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17");

	static {
		postgres.start();
	}

}
