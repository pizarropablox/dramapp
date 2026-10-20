package cl.dramapp.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.concurrent.atomic.AtomicInteger;

import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockCookie;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

import cl.dramapp.backend.PostgresIntegrationTest;
import jakarta.servlet.http.Cookie;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AuthControllerTests extends PostgresIntegrationTest {

	/** Each test logs in from its own address, so the login limiter (shared by the context) never mixes them. */
	private static final AtomicInteger nextClient = new AtomicInteger(1);

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private JwtEncoder jwtEncoder;

	@Autowired
	private AuthProperties authProperties;

	private final String client = "10.27.0." + nextClient.getAndIncrement();

	private MvcTestResult login(String username, String password) {
		return mvc.post().uri("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("""
				{"username": "%s", "password": "%s"}""".formatted(username, password)).with(request -> {
			request.setRemoteAddr(client);
			return request;
		}).exchange();
	}

	private Cookie sessionCookie(MvcTestResult login) {
		Cookie cookie = login.getResponse().getCookie(SessionCookies.NAME);
		assertThat(cookie).isNotNull();
		return new Cookie(SessionCookies.NAME, cookie.getValue());
	}

	private MvcTestResult me(Cookie session) {
		return mvc.get().uri("/api/auth/me").cookie(session).exchange();
	}

	private MvcTestResult meWithBearer(String token) {
		return mvc.get().uri("/api/auth/me").header(HttpHeaders.AUTHORIZATION, "Bearer " + token).exchange();
	}

	private static void assertProblem(MvcTestResult result, HttpStatus status, String detail) {
		assertThat(result).hasStatus(status).hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.detail").isEqualTo(detail);
	}

	@Test
	void loginSetsAnHttpOnlyStrictSessionCookieThatLastsTheWholeNight() {
		var result = login("barra", BARRA_PASSWORD);

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.username").isEqualTo("barra");
		assertThat(result).bodyJson().extractingPath("$.role").isEqualTo("BARRA");
		assertThat(result).bodyJson().extractingPath("$.expiresAt").asString().satisfies(expiresAt -> assertThat(
				Instant.parse(expiresAt)).isCloseTo(Instant.now().plus(Duration.ofHours(24)), within(1, ChronoUnit.MINUTES)));

		MockCookie cookie = (MockCookie) result.getResponse().getCookie(SessionCookies.NAME);
		assertThat(cookie).isNotNull();
		assertThat(cookie.isHttpOnly()).isTrue();
		assertThat(cookie.getSameSite()).isEqualTo("Strict");
		assertThat(cookie.getPath()).isEqualTo("/api");
		assertThat(cookie.getMaxAge()).isBetween(86_340, 86_400);
		// Local profile: plain http on the LAN must work. ProductionProfileTests checks Secure.
		assertThat(cookie.getSecure()).isFalse();
	}

	@Test
	void loginAlsoReturnsTheTokenForBearerClients() {
		var result = login("admin", ADMIN_PASSWORD);

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.role").isEqualTo("ADMIN");
		String token = result.getResponse().getCookie(SessionCookies.NAME).getValue();
		assertThat(result).bodyJson().extractingPath("$.token").isEqualTo(token);
		assertThat(meWithBearer(token)).hasStatus(HttpStatus.OK);
	}

	@Test
	void loginHandsOutTheXsrfCookieForTheFirstPost() {
		var result = login("barra", BARRA_PASSWORD);

		// The raw headers, not getCookie(): the session cookie once replaced the XSRF one in the real response.
		assertThat(result.getResponse().getHeaders(HttpHeaders.SET_COOKIE)).hasSize(2)
			.anySatisfy(header -> assertThat(header).startsWith(SessionCookies.NAME + "="))
			// Angular must read it to echo it in X-XSRF-TOKEN: not HttpOnly.
			.anySatisfy(header -> assertThat(header).startsWith("XSRF-TOKEN=").doesNotContainIgnoringCase("HttpOnly"));
	}

	@Test
	void usernameIgnoresCaseAndSurroundingSpaces() {
		assertThat(login("  Barra ", BARRA_PASSWORD)).hasStatus(HttpStatus.OK);
	}

	@Test
	void wrongPasswordAndUnknownUserGetTheSameAnswer() {
		var wrongPassword = login("barra", ADMIN_PASSWORD);
		var unknownUser = login("cajera", BARRA_PASSWORD);

		assertProblem(wrongPassword, HttpStatus.UNAUTHORIZED, "Usuario o contraseña incorrectos.");
		assertProblem(unknownUser, HttpStatus.UNAUTHORIZED, "Usuario o contraseña incorrectos.");
		assertThat(wrongPassword.getResponse().getCookie(SessionCookies.NAME)).isNull();
	}

	@Test
	void passwordIsCaseSensitive() {
		assertThat(login("barra", BARRA_PASSWORD.toUpperCase())).hasStatus(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void blankCredentialsAreInvalid() {
		var result = login(" ", "");

		assertThat(result).hasStatus(HttpStatus.BAD_REQUEST);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().contains("username: Ingresa el usuario.",
				"password: Ingresa la contraseña.");
	}

	@Test
	void fiveFailuresBlockTheClientEvenWithTheRightPassword() {
		for (int i = 0; i < LoginRateLimiter.MAX_FAILURES_PER_CLIENT; i++) {
			assertThat(login("barra", "wrong-" + i)).hasStatus(HttpStatus.UNAUTHORIZED);
		}

		var blocked = login("barra", BARRA_PASSWORD);

		assertProblem(blocked, HttpStatus.TOO_MANY_REQUESTS,
				"Demasiados intentos fallidos. Espera 5 minutos e inténtalo de nuevo.");
		assertThat(blocked).hasHeader(HttpHeaders.RETRY_AFTER, "300");
		assertThat(blocked.getResponse().getCookie(SessionCookies.NAME)).isNull();
	}

	@Test
	void meDescribesTheSessionOfTheCookie() {
		var session = sessionCookie(login("barra", BARRA_PASSWORD));

		var result = me(session);

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.username").isEqualTo("barra");
		assertThat(result).bodyJson().extractingPath("$.role").isEqualTo("BARRA");
		assertThat(result).bodyJson().extractingPath("$.expiresAt").asString().isNotBlank();
		assertThat(result).bodyJson().doesNotHavePath("$.token");
	}

	@Test
	void withoutASessionTheAnswerAsksToLogInAgain() {
		assertProblem(mvc.get().uri("/api/auth/me").exchange(), HttpStatus.UNAUTHORIZED,
				SecurityProblems.SESSION_EXPIRED);
	}

	@Test
	void logoutRemovesTheCookie() {
		var result = mvc.post().uri("/api/auth/logout").exchange();

		assertThat(result).hasStatus(HttpStatus.NO_CONTENT);
		Cookie cookie = result.getResponse().getCookie(SessionCookies.NAME);
		assertThat(cookie).isNotNull();
		assertThat(cookie.getMaxAge()).isZero();
		assertThat(cookie.getPath()).isEqualTo("/api");
	}

	@Test
	void anExpiredTokenIsRejected() {
		Clock twoDaysAgo = Clock.fixed(Instant.now().minus(Duration.ofDays(2)), ZoneOffset.UTC);
		String token = new JwtService(jwtEncoder, authProperties, twoDaysAgo).issue("barra", Role.BARRA).value();

		assertProblem(me(new Cookie(SessionCookies.NAME, token)), HttpStatus.UNAUTHORIZED,
				SecurityProblems.SESSION_EXPIRED);
		assertThat(meWithBearer(token)).hasStatus(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void aTokenSignedWithAnotherKeyIsRejected() {
		byte[] otherSecret = new byte[32];
		new SecureRandom().nextBytes(otherSecret);
		var otherEncoder = new NimbusJwtEncoder(new ImmutableSecret<>(new SecretKeySpec(otherSecret, "HmacSHA256")));
		String token = new JwtService(otherEncoder, authProperties).issue("admin", Role.ADMIN).value();

		assertThat(meWithBearer(token)).hasStatus(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void aTokenWhoseRoleWasEditedIsRejected() {
		String[] parts = login("barra", BARRA_PASSWORD).getResponse().getCookie(SessionCookies.NAME)
			.getValue().split("\\.");
		String payload = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
		String forged = Base64.getUrlEncoder().withoutPadding()
			.encodeToString(payload.replace("\"BARRA\"", "\"ADMIN\"").getBytes(StandardCharsets.UTF_8));

		var result = meWithBearer(parts[0] + "." + forged + "." + parts[2]);

		assertThat(result).hasStatus(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void aTokenWithAnUnknownRoleIsRejected() {
		Instant now = Instant.now();
		JwtClaimsSet claims = JwtClaimsSet.builder().issuer(JwtService.ISSUER).subject("barra")
			.claim(JwtService.ROLE_CLAIM, "SUPERUSER").issuedAt(now).expiresAt(now.plusSeconds(600)).build();
		String token = jwtEncoder
			.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims)).getTokenValue();

		assertThat(meWithBearer(token)).hasStatus(HttpStatus.UNAUTHORIZED);
	}

	@Test
	void aStaleCookieDoesNotBlockLoggingInAgain() {
		var result = mvc.post().uri("/api/auth/login").cookie(new Cookie(SessionCookies.NAME, "stale.token.value"))
			.contentType(MediaType.APPLICATION_JSON).content("""
					{"username": "barra", "password": "%s"}""".formatted(BARRA_PASSWORD)).exchange();

		assertThat(result).hasStatus(HttpStatus.OK);
	}

	@Test
	void cookieSessionsMustEchoTheXsrfToken() {
		var login = login("barra", BARRA_PASSWORD);
		Cookie session = sessionCookie(login);
		String xsrf = login.getResponse().getCookie("XSRF-TOKEN").getValue();

		var withoutToken = mvc.post().uri("/api/sales").cookie(session)
			.contentType(MediaType.APPLICATION_JSON).content("{}").exchange();
		var withToken = mvc.post().uri("/api/sales").cookie(session, new Cookie("XSRF-TOKEN", xsrf))
			.header("X-XSRF-TOKEN", xsrf).contentType(MediaType.APPLICATION_JSON).content("{}").exchange();

		assertProblem(withoutToken, HttpStatus.FORBIDDEN, SecurityProblems.CSRF_REJECTED);
		// Past security: the empty sale is then rejected by validation.
		assertThat(withToken).hasStatus(HttpStatus.BAD_REQUEST);
	}

	@Test
	void bearerSessionsNeedNoXsrfToken() {
		String token = login("barra", BARRA_PASSWORD).getResponse().getCookie(SessionCookies.NAME).getValue();

		var result = mvc.post().uri("/api/sales").header(HttpHeaders.AUTHORIZATION, "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{}").exchange();

		assertThat(result).hasStatus(HttpStatus.BAD_REQUEST);
	}

}
