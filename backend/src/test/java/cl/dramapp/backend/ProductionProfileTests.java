package cl.dramapp.backend;

import static org.assertj.core.api.Assertions.assertThat;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;

import com.zaxxer.hikari.HikariDataSource;

/** The prod profile starts (Flyway included) and keeps no idle connections, so Neon can scale to zero. */
@SpringBootTest
@ActiveProfiles("prod")
class ProductionProfileTests extends PostgresIntegrationTest {

	@Autowired
	private DataSource dataSource;

	@Autowired
	private Environment environment;

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

}
