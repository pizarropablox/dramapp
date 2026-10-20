package cl.dramapp.backend.auth;

import java.time.Duration;
import java.util.Base64;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.StringUtils;

/**
 * Login settings, from environment variables (see application.yml). No password, hash or secret lives in the repo.
 *
 * @param barraPassword encoded password of the {@code barra} user, e.g. {@code {bcrypt}$2y$10$...}
 * @param adminPassword encoded password of the {@code admin} user
 * @param jwtSecret base64 key (at least 256 bits) that signs the session tokens
 * @param sessionTtl how long a session lasts; fixed, it is not renewed while in use
 * @param secureCookie whether the session cookie is HTTPS-only (prod); off locally so http:// works on the LAN
 * @param requireProductionSecrets prod: refuse to start without the secret and with anything but bcrypt passwords
 */
@ConfigurationProperties("dramapp.auth")
public record AuthProperties(String barraPassword, String adminPassword, String jwtSecret,
		@DefaultValue("24h") Duration sessionTtl, boolean secureCookie, boolean requireProductionSecrets) {

	static final int MIN_SECRET_BYTES = 32;

	public String passwordOf(Role role) {
		return role == Role.ADMIN ? adminPassword : barraPassword;
	}

	/** Fails fast on a configuration that must not reach production. */
	void validate() {
		if (StringUtils.hasText(jwtSecret)) {
			decodedSecret();
		}
		else if (requireProductionSecrets) {
			throw new IllegalStateException("DRAMAPP_JWT_SECRET is required");
		}
		if (!requireProductionSecrets) {
			return;
		}
		for (Role role : Role.values()) {
			String password = passwordOf(role);
			String variable = "DRAMAPP_" + role.name() + "_PASSWORD";
			if (!StringUtils.hasText(password)) {
				throw new IllegalStateException(variable + " is required");
			}
			if (!password.startsWith("{bcrypt}")) {
				throw new IllegalStateException(variable + " must be a {bcrypt} hash");
			}
		}
	}

	byte[] decodedSecret() {
		byte[] secret;
		try {
			secret = Base64.getDecoder().decode(jwtSecret.strip());
		}
		catch (IllegalArgumentException ex) {
			throw new IllegalStateException("DRAMAPP_JWT_SECRET must be base64", ex);
		}
		if (secret.length < MIN_SECRET_BYTES) {
			throw new IllegalStateException("DRAMAPP_JWT_SECRET must have at least 256 bits");
		}
		return secret;
	}

}
