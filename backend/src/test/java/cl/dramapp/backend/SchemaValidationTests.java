package cl.dramapp.backend;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;

@SpringBootTest
class SchemaValidationTests extends PostgresIntegrationTest {

	@Autowired
	private Environment environment;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	@Test
	void contextStartsWithHibernateSchemaValidation() {
		assertThat(environment.getProperty("spring.jpa.hibernate.ddl-auto")).isEqualTo("validate");
	}

	@Test
	void salesModelMigrationIsApplied() {
		Boolean applied = jdbcTemplate.queryForObject(
				"SELECT success FROM flyway_schema_history WHERE version = '2'", Boolean.class);

		assertThat(applied).isTrue();
	}

}
