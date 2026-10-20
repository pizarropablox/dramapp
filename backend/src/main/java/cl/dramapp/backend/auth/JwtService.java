package cl.dramapp.backend.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidatorResult;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.stereotype.Service;

/** Issues the session token: an HS256 JWT with the user, its role and a fixed expiry. */
@Service
public class JwtService {

	static final String ISSUER = "dramapp";

	static final String ROLE_CLAIM = "role";

	private final JwtEncoder encoder;

	private final AuthProperties properties;

	private final Clock clock;

	@Autowired
	public JwtService(JwtEncoder encoder, AuthProperties properties) {
		this(encoder, properties, Clock.systemUTC());
	}

	JwtService(JwtEncoder encoder, AuthProperties properties, Clock clock) {
		this.encoder = encoder;
		this.properties = properties;
		this.clock = clock;
	}

	public IssuedToken issue(String username, Role role) {
		Instant now = clock.instant();
		Instant expiresAt = now.plus(properties.sessionTtl());
		JwtClaimsSet claims = JwtClaimsSet.builder()
			.issuer(ISSUER)
			.subject(username)
			.claim(ROLE_CLAIM, role.name())
			.issuedAt(now)
			.expiresAt(expiresAt)
			.build();
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
		return new IssuedToken(token, expiresAt);
	}

	static Role roleOf(Jwt jwt) {
		return Role.valueOf(jwt.getClaimAsString(ROLE_CLAIM));
	}

	/** Expiry (with Spring's default 60 s of clock skew), our issuer and a known role. */
	static OAuth2TokenValidator<Jwt> validator() {
		OAuth2TokenValidator<Jwt> knownRole = jwt -> {
			String role = jwt.getClaimAsString(ROLE_CLAIM);
			return Arrays.stream(Role.values()).anyMatch(known -> known.name().equals(role))
					? OAuth2TokenValidatorResult.success()
					: OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token", "Unknown role", null));
		};
		return new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(ISSUER), knownRole);
	}

	public record IssuedToken(String value, Instant expiresAt) {
	}

}
