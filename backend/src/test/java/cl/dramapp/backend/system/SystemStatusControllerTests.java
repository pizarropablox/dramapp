package cl.dramapp.backend.system;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import cl.dramapp.backend.PostgresIntegrationTest;

@SpringBootTest
@AutoConfigureMockMvc
@WithMockUser(roles = "ADMIN")
class SystemStatusControllerTests extends PostgresIntegrationTest {

	@Autowired
	private MockMvcTester mvc;

	@Test
	void statusReportsApplicationAndDatabaseInfo() {
		var result = mvc.get().uri("/api/system/status").exchange();

		assertThat(result).hasStatus(HttpStatus.OK).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result).bodyJson().extractingPath("$.status").isEqualTo("UP");
		assertThat(result).bodyJson().extractingPath("$.application").isEqualTo("backend");
		assertThat(result).bodyJson().extractingPath("$.databaseVersion").asString().startsWith("PostgreSQL 17");
		assertThat(result).bodyJson().extractingPath("$.databaseTime").asString().isNotBlank();
	}

}
