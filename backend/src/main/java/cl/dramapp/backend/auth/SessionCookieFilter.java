package cl.dramapp.backend.auth;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;

import org.springframework.http.HttpHeaders;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.WebUtils;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Hands the session cookie's token to the resource server as if it were an {@code Authorization: Bearer} header.
 * <p>
 * It runs after the CSRF filter on purpose. Spring skips CSRF for every request whose token its BearerTokenResolver
 * finds; if that resolver read the cookie, cookie requests (the ones a forged cross-site form would send) would skip
 * it too. So the resolver only reads real headers, CSRF sees cookie requests as they are, and this filter converts
 * the cookie afterwards. A request that already has a header keeps it.
 * <p>
 * Login and logout skip the cookie: a stale one (e.g. after rotating the secret) must not block logging in again.
 */
class SessionCookieFilter extends OncePerRequestFilter {

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		String token = sessionToken(request);
		if (token == null || request.getHeader(HttpHeaders.AUTHORIZATION) != null
				|| AuthController.PUBLIC_PATHS.contains(request.getRequestURI())) {
			chain.doFilter(request, response);
			return;
		}
		chain.doFilter(new BearerRequest(request, "Bearer " + token), response);
	}

	static boolean hasSessionCookie(HttpServletRequest request) {
		return sessionToken(request) != null;
	}

	private static String sessionToken(HttpServletRequest request) {
		Cookie cookie = WebUtils.getCookie(request, SessionCookies.NAME);
		return cookie != null && StringUtils.hasText(cookie.getValue()) ? cookie.getValue() : null;
	}

	private static final class BearerRequest extends HttpServletRequestWrapper {

		private final String authorization;

		BearerRequest(HttpServletRequest request, String authorization) {
			super(request);
			this.authorization = authorization;
		}

		@Override
		public String getHeader(String name) {
			return HttpHeaders.AUTHORIZATION.equalsIgnoreCase(name) ? authorization : super.getHeader(name);
		}

		@Override
		public Enumeration<String> getHeaders(String name) {
			return HttpHeaders.AUTHORIZATION.equalsIgnoreCase(name) ? Collections.enumeration(List.of(authorization))
					: super.getHeaders(name);
		}

		@Override
		public Enumeration<String> getHeaderNames() {
			List<String> names = new ArrayList<>(Collections.list(super.getHeaderNames()));
			names.add(HttpHeaders.AUTHORIZATION);
			return Collections.enumeration(names);
		}

	}

}
