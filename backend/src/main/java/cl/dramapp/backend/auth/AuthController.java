package cl.dramapp.backend.auth;

import java.util.Locale;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

	static final String LOGIN_PATH = "/api/auth/login";

	static final String LOGOUT_PATH = "/api/auth/logout";

	/** Open to anyone; they also ignore any session token, so a stale one never blocks logging in. */
	static final Set<String> PUBLIC_PATHS = Set.of(LOGIN_PATH, LOGOUT_PATH);

	private static final Logger log = LoggerFactory.getLogger(AuthController.class);

	private final AuthenticationManager authenticationManager;

	private final JwtService jwtService;

	private final SessionCookies sessionCookies;

	private final LoginRateLimiter rateLimiter;

	public AuthController(AuthenticationManager authenticationManager, JwtService jwtService,
			SessionCookies sessionCookies, LoginRateLimiter rateLimiter) {
		this.authenticationManager = authenticationManager;
		this.jwtService = jwtService;
		this.sessionCookies = sessionCookies;
		this.rateLimiter = rateLimiter;
	}

	@PostMapping("/login")
	public LoginResponse login(@Valid @RequestBody LoginRequest request, HttpServletRequest httpRequest,
			HttpServletResponse httpResponse) {
		// Behind Render's proxies, server.forward-headers-strategy=native resolves the client from X-Forwarded-For.
		String client = httpRequest.getRemoteAddr();
		rateLimiter.retryAfter(client).ifPresent(wait -> {
			log.warn("Login blocked for {} (too many failed attempts)", client);
			throw new TooManyLoginAttemptsException(wait);
		});
		// Phones capitalize the first letter: "Barra" is barra.
		String username = request.username().strip().toLowerCase(Locale.ROOT);
		Authentication authentication;
		try {
			authentication = authenticationManager
				.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(username, request.password()));
		}
		catch (AuthenticationException ex) {
			rateLimiter.recordFailure(client);
			log.warn("Failed login from {}", client);
			throw new InvalidCredentialsException();
		}
		rateLimiter.recordSuccess(client);
		Role role = Role.fromAuthorities(authentication.getAuthorities());
		log.info("Login as {} from {}", authentication.getName(), client);

		JwtService.IssuedToken token = jwtService.issue(authentication.getName(), role);
		// addHeader, not ResponseEntity headers: those replace the XSRF-TOKEN cookie the CSRF filter already set.
		httpResponse.addHeader(HttpHeaders.SET_COOKIE,
				sessionCookies.create(token.value(), token.expiresAt()).toString());
		return new LoginResponse(authentication.getName(), role, token.expiresAt(), token.value());
	}

	@GetMapping("/me")
	public SessionResponse me(@AuthenticationPrincipal Jwt jwt) {
		return new SessionResponse(jwt.getSubject(), JwtService.roleOf(jwt), jwt.getExpiresAt());
	}

	/** Removes the cookie. A token copied elsewhere stays valid until it expires (see README > Sesiones). */
	@PostMapping("/logout")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void logout(HttpServletResponse httpResponse) {
		httpResponse.addHeader(HttpHeaders.SET_COOKIE, sessionCookies.clear().toString());
	}

}
