package cl.dramapp.backend.auth;

import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.HttpMethod.POST;

import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpHeaders;
import org.springframework.security.access.hierarchicalroles.RoleHierarchy;
import org.springframework.security.access.hierarchicalroles.RoleHierarchyImpl;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.csrf.CsrfFilter;

import jakarta.servlet.DispatcherType;
import jakarta.servlet.http.HttpServletRequest;

/**
 * Who may call what. Stateless: every request carries the session token (cookie or Bearer header), there is no
 * server-side session. Anything not listed here is denied, so a new endpoint stays closed until it is added.
 */
@Configuration
@EnableWebSecurity
class SecurityConfig {

	private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS", "TRACE");

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityProblems problems) throws Exception {
		http.authorizeHttpRequests(requests -> requests
			// Error pages and forwards re-run the chain; the original request was already authorized.
			.dispatcherTypeMatchers(DispatcherType.ERROR, DispatcherType.FORWARD).permitAll()
			.requestMatchers(POST, AuthController.LOGIN_PATH, AuthController.LOGOUT_PATH).permitAll()
			// Render's health check and UptimeRobot.
			.requestMatchers(GET, "/actuator/health/liveness").permitAll()

			// The event's .xlsx (DRAMA-42): admin only. First among the /api/events rules, so no broader barra rule
			// added later can let barra read it.
			.requestMatchers(GET, "/api/events/*/export").hasRole(Role.ADMIN.name())

			.requestMatchers(GET, "/api/auth/me").hasRole(Role.BARRA.name())
			.requestMatchers(GET, "/api/products", "/api/products/**").hasRole(Role.BARRA.name())
			.requestMatchers(GET, "/api/events/current", "/api/events/*/summary").hasRole(Role.BARRA.name())
			.requestMatchers(GET, "/api/sales").hasRole(Role.BARRA.name())
			.requestMatchers(POST, "/api/sales", "/api/sales/*/void").hasRole(Role.BARRA.name())
			.requestMatchers(GET, "/api/refunds").hasRole(Role.BARRA.name())
			.requestMatchers(POST, "/api/refunds", "/api/refunds/*/void").hasRole(Role.BARRA.name())

			// Opening and closing events, the menu (any change to /api/products) and diagnostics.
			.requestMatchers(POST, "/api/events", "/api/events/*/close").hasRole(Role.ADMIN.name())
			.requestMatchers("/api/products", "/api/products/**").hasRole(Role.ADMIN.name())
			.requestMatchers(GET, "/api/system/status").hasRole(Role.ADMIN.name())
			.requestMatchers("/actuator/**").hasRole(Role.ADMIN.name())

			.anyRequest().denyAll());

		http.oauth2ResourceServer(resourceServer -> resourceServer
			.bearerTokenResolver(headerTokenResolver())
			.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
			.authenticationEntryPoint(problems.authenticationEntryPoint())
			.accessDeniedHandler(problems.accessDeniedHandler()));
		http.exceptionHandling(exceptions -> exceptions
			.authenticationEntryPoint(problems.authenticationEntryPoint())
			.accessDeniedHandler(problems.accessDeniedHandler()));

		// The browser attaches the cookie on its own, so cookie requests need the XSRF-TOKEN cookie echoed in the
		// X-XSRF-TOKEN header (Angular does it). A Bearer header cannot be forged cross-site: no token needed.
		http.csrf(csrf -> csrf.spa().requireCsrfProtectionMatcher(SecurityConfig::needsCsrfToken));
		http.addFilterAfter(new CsrfCookieFilter(), CsrfFilter.class);
		// After CSRF, never before: see SessionCookieFilter.
		http.addFilterAfter(new SessionCookieFilter(), CsrfCookieFilter.class);

		http.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS));
		http.requestCache(AbstractHttpConfigurer::disable);
		http.formLogin(AbstractHttpConfigurer::disable);
		http.httpBasic(AbstractHttpConfigurer::disable);
		http.logout(AbstractHttpConfigurer::disable);
		return http.build();
	}

	/** ADMIN can do everything BARRA can. */
	@Bean
	static RoleHierarchy roleHierarchy() {
		return RoleHierarchyImpl.withDefaultRolePrefix().role(Role.ADMIN.name()).implies(Role.BARRA.name()).build();
	}

	static boolean needsCsrfToken(HttpServletRequest request) {
		return !SAFE_METHODS.contains(request.getMethod())
				&& !AuthController.PUBLIC_PATHS.contains(request.getRequestURI())
				&& request.getHeader(HttpHeaders.AUTHORIZATION) == null
				&& SessionCookieFilter.hasSessionCookie(request);
	}

	/**
	 * Real {@code Authorization: Bearer} headers only (the cookie is handled by SessionCookieFilter). Login and logout
	 * ignore it, so a bad token never blocks logging in.
	 */
	private static BearerTokenResolver headerTokenResolver() {
		DefaultBearerTokenResolver header = new DefaultBearerTokenResolver();
		return request -> AuthController.PUBLIC_PATHS.contains(request.getRequestURI()) ? null
				: header.resolve(request);
	}

	private static JwtAuthenticationConverter jwtAuthenticationConverter() {
		JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
		converter.setJwtGrantedAuthoritiesConverter(
				jwt -> List.of(new SimpleGrantedAuthority(JwtService.roleOf(jwt).authority())));
		return converter;
	}

}
