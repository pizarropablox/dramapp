package cl.dramapp.backend.auth;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.security.provisioning.InMemoryUserDetailsManager;
import org.springframework.util.StringUtils;

import com.nimbusds.jose.jwk.source.ImmutableSecret;

/** The two users (from environment variables) and the HS256 key that signs and checks session tokens. */
@Configuration
@EnableConfigurationProperties(AuthProperties.class)
class AuthConfig {

	private static final Logger log = LoggerFactory.getLogger(AuthConfig.class);

	@Bean
	PasswordEncoder passwordEncoder() {
		// Reads the {bcrypt}/{noop} prefix of each stored password; prod accepts only {bcrypt} (AuthProperties).
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	@Bean
	UserDetailsService userDetailsService(AuthProperties properties) {
		properties.validate();
		List<UserDetails> users = new ArrayList<>();
		for (Role role : Role.values()) {
			String password = properties.passwordOf(role);
			if (StringUtils.hasText(password)) {
				users.add(User.withUsername(role.username()).password(password).roles(role.name()).build());
			}
			else {
				log.warn("DRAMAPP_{}_PASSWORD is not set: user '{}' cannot log in", role.name(), role.username());
			}
		}
		return new InMemoryUserDetailsManager(users);
	}

	@Bean
	AuthenticationManager authenticationManager(UserDetailsService users, PasswordEncoder passwordEncoder) {
		// For an unknown user it still checks a dummy hash, so the answer takes as long as a wrong password.
		DaoAuthenticationProvider provider = new DaoAuthenticationProvider(users);
		provider.setPasswordEncoder(passwordEncoder);
		return new ProviderManager(provider);
	}

	@Bean
	SecretKey jwtKey(AuthProperties properties) {
		properties.validate();
		byte[] secret;
		if (StringUtils.hasText(properties.jwtSecret())) {
			secret = properties.decodedSecret();
		}
		else {
			// Local only (prod requires the variable): sessions die when the backend restarts.
			log.warn("DRAMAPP_JWT_SECRET is not set: using a random key for this run");
			secret = new byte[AuthProperties.MIN_SECRET_BYTES];
			new SecureRandom().nextBytes(secret);
		}
		return new SecretKeySpec(secret, "HmacSHA256");
	}

	@Bean
	JwtEncoder jwtEncoder(SecretKey jwtKey) {
		return new NimbusJwtEncoder(new ImmutableSecret<>(jwtKey));
	}

	@Bean
	JwtDecoder jwtDecoder(SecretKey jwtKey) {
		NimbusJwtDecoder decoder = NimbusJwtDecoder.withSecretKey(jwtKey).macAlgorithm(MacAlgorithm.HS256).build();
		decoder.setJwtValidator(JwtService.validator());
		return decoder;
	}

}
