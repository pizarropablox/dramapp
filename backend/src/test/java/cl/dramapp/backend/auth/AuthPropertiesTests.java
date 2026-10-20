package cl.dramapp.backend.auth;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

import java.time.Duration;
import java.util.Base64;

import org.junit.jupiter.api.Test;

/** What the prod profile refuses to start with (require-production-secrets), and what is fine locally. */
class AuthPropertiesTests {

	private static final String SECRET = Base64.getEncoder().encodeToString(new byte[32]);

	private static final String BCRYPT = "{bcrypt}not-checked-here";

	private static AuthProperties prod(String barra, String admin, String secret) {
		return new AuthProperties(barra, admin, secret, Duration.ofHours(24), true, true);
	}

	private static AuthProperties local(String barra, String admin, String secret) {
		return new AuthProperties(barra, admin, secret, Duration.ofHours(24), false, false);
	}

	@Test
	void prodStartsWithBcryptPasswordsAndASecret() {
		assertThatCode(() -> prod(BCRYPT, BCRYPT, SECRET).validate()).doesNotThrowAnyException();
	}

	@Test
	void prodRequiresTheSecret() {
		assertThatIllegalStateException().isThrownBy(() -> prod(BCRYPT, BCRYPT, " ").validate())
			.withMessageContaining("DRAMAPP_JWT_SECRET");
	}

	@Test
	void prodRequiresBothPasswords() {
		assertThatIllegalStateException().isThrownBy(() -> prod(BCRYPT, null, SECRET).validate())
			.withMessageContaining("DRAMAPP_ADMIN_PASSWORD");
		assertThatIllegalStateException().isThrownBy(() -> prod("", BCRYPT, SECRET).validate())
			.withMessageContaining("DRAMAPP_BARRA_PASSWORD");
	}

	@Test
	void prodRejectsPlainTextPasswords() {
		assertThatIllegalStateException().isThrownBy(() -> prod("{noop}barra", BCRYPT, SECRET).validate())
			.withMessageContaining("{bcrypt}");
	}

	@Test
	void theSecretMustBeBase64WithAtLeast256Bits() {
		String short128 = Base64.getEncoder().encodeToString(new byte[16]);

		assertThatIllegalStateException().isThrownBy(() -> local(null, null, short128).validate())
			.withMessageContaining("256 bits");
		assertThatIllegalStateException().isThrownBy(() -> local(null, null, "not base64!").validate())
			.withMessageContaining("base64");
	}

	@Test
	void locallyEverythingIsOptional() {
		assertThatCode(() -> local(null, "{noop}admin", null).validate()).doesNotThrowAnyException();
	}

}
