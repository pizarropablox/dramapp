package cl.dramapp.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * The session cookie. HttpOnly so a script cannot read the token; SameSite=Strict and only for /api, where the
 * frontend reaches the backend through the same origin (Angular's proxy locally, Render's rewrite in prod).
 */
@Component
public class SessionCookies {

	public static final String NAME = "DRAMAPP_SESSION";

	static final String PATH = "/api";

	private final AuthProperties properties;

	private final Clock clock;

	@Autowired
	public SessionCookies(AuthProperties properties) {
		this(properties, Clock.systemUTC());
	}

	SessionCookies(AuthProperties properties, Clock clock) {
		this.properties = properties;
		this.clock = clock;
	}

	/** Lives exactly as long as the token, so the browser drops both together. */
	public ResponseCookie create(String token, Instant expiresAt) {
		Duration maxAge = Duration.between(clock.instant(), expiresAt);
		return cookie(token, maxAge.isNegative() ? Duration.ZERO : maxAge);
	}

	public ResponseCookie clear() {
		return cookie("", Duration.ZERO);
	}

	private ResponseCookie cookie(String value, Duration maxAge) {
		return ResponseCookie.from(NAME, value)
			.httpOnly(true)
			.secure(properties.secureCookie())
			.sameSite("Strict")
			.path(PATH)
			.maxAge(maxAge)
			.build();
	}

}
