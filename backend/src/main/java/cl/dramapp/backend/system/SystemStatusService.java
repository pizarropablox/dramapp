package cl.dramapp.backend.system;

import java.time.OffsetDateTime;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
public class SystemStatusService {

	private final JdbcTemplate jdbcTemplate;

	private final String applicationName;

	public SystemStatusService(JdbcTemplate jdbcTemplate, @Value("${spring.application.name}") String applicationName) {
		this.jdbcTemplate = jdbcTemplate;
		this.applicationName = applicationName;
	}

	public SystemStatus getStatus() {
		String databaseVersion = jdbcTemplate.queryForObject("SELECT version()", String.class);
		OffsetDateTime databaseTime = jdbcTemplate.queryForObject("SELECT now()", OffsetDateTime.class);
		return new SystemStatus("UP", applicationName, databaseVersion, databaseTime);
	}

}
