package cl.dramapp.backend.point;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;

import cl.dramapp.backend.point.PointProperties.Terminal;

class PointPropertiesTests {

	private static final String TWO = "SMART-1=Smart 1; SMART-2 = Smart 2 ;";

	private static PointProperties properties(String token, String terminals, String ticket, String prefix) {
		return new PointProperties(token, terminals, ticket, prefix, "http://localhost");
	}

	@Test
	void readsTheTerminalsInOrder() {
		PointProperties properties = properties("token", TWO, "no_ticket", "prod");

		assertThat(properties.terminalList()).containsExactly(new Terminal("SMART-1", "Smart 1"),
				new Terminal("SMART-2", "Smart 2"));
		assertThat(properties.terminal("SMART-2")).contains(new Terminal("SMART-2", "Smart 2"));
		assertThat(properties.terminal("SMART-3")).isEmpty();
		assertThatCode(properties::validate).doesNotThrowAnyException();
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { " ", ";" })
	void withoutTerminalsThePointIsOffAndNothingIsRequired(String terminals) {
		PointProperties properties = properties(null, terminals, null, null);

		assertThat(properties.terminalList()).isEmpty();
		assertThatCode(properties::validate).doesNotThrowAnyException();
	}

	@ParameterizedTest
	@ValueSource(strings = { "SMART-1", "=Smart 1", "SMART-1=", "SMART-1=Smart 1;SMART-2" })
	void rejectsAMalformedList(String terminals) {
		assertThatIllegalStateException().isThrownBy(() -> properties("token", terminals, "no_ticket", "prod").validate())
			.withMessageContaining("DRAMAPP_POINT_TERMINALS");
	}

	@Test
	void onceOnItRequiresTheTokenThePrefixAndAKnownTicket() {
		assertThatIllegalStateException().isThrownBy(() -> properties(" ", TWO, "no_ticket", "prod").validate())
			.withMessageContaining("DRAMAPP_POINT_ACCESS_TOKEN");
		assertThatIllegalStateException().isThrownBy(() -> properties("token", TWO, "no_ticket", "").validate())
			.withMessageContaining("DRAMAPP_POINT_KEY_PREFIX");
		assertThatIllegalStateException().isThrownBy(() -> properties("token", TWO, "no_ticket", "Prod 1").validate())
			.withMessageContaining("DRAMAPP_POINT_KEY_PREFIX");
		assertThatIllegalStateException().isThrownBy(() -> properties("token", TWO, "buyer_ticket", "prod").validate())
			.withMessageContaining("DRAMAPP_POINT_PRINT_ON_TERMINAL");
	}

	@Test
	void neverShowsTheToken() {
		PointProperties properties = properties("APP_USR-secret", TWO, "no_ticket", "prod");

		assertThat(properties.toString()).doesNotContain("APP_USR-secret");
	}

}
