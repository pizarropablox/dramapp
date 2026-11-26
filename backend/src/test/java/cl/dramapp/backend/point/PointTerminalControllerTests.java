package cl.dramapp.backend.point;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MockMvcTester;

import cl.dramapp.backend.PostgresIntegrationTest;

class PointTerminalControllerTests {

	@Nested
	@WithMockUser(roles = "BARRA")
	class WithTerminals extends PointIntegrationTest {

		@Autowired
		private MockMvcTester mvc;

		@Test
		void listsThemInOrderWithoutTheToken() {
			var result = mvc.get().uri("/api/point/terminals").exchange();

			assertThat(result).hasStatus(HttpStatus.OK).bodyJson().isStrictlyEqualTo("""
					[{"id": "SMART-1", "name": "Smart 1"}, {"id": "SMART-2", "name": "Smart 2"}]""");
		}

	}

	@Nested
	@SpringBootTest
	@AutoConfigureMockMvc
	@WithMockUser(roles = "BARRA")
	class WithThePointOff extends PostgresIntegrationTest {

		@Autowired
		private MockMvcTester mvc;

		@Test
		void thereIsNothingToChoose() {
			assertThat(mvc.get().uri("/api/point/terminals").exchange()).hasStatus(HttpStatus.OK)
				.bodyJson()
				.isStrictlyEqualTo("[]");
		}

	}

}
