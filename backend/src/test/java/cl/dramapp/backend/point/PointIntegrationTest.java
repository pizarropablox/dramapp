package cl.dramapp.backend.point;

import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;

import cl.dramapp.backend.PostgresIntegrationTest;

/**
 * Base for tests with two Smarts and a fake Mercado Pago. Not {@code @Transactional}: Mercado Pago must never be
 * called inside a transaction, and a rollback around the test would be one.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(PointIntegrationTest.FakeMercadoPago.class)
@TestPropertySource(properties = { "dramapp.point.terminals=SMART-1=Smart 1;SMART-2=Smart 2",
		"dramapp.point.access-token=test-token", "dramapp.point.key-prefix=test" })
public abstract class PointIntegrationTest extends PostgresIntegrationTest {

	public static final String SMART_1 = "SMART-1";

	public static final String SMART_2 = "SMART-2";

	@TestConfiguration
	static class FakeMercadoPago {

		@Bean
		@Primary
		FakeMercadoPagoClient fakeMercadoPagoClient() {
			return new FakeMercadoPagoClient();
		}

	}

}
