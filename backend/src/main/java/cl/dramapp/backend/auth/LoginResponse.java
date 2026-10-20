package cl.dramapp.backend.auth;

import java.time.Instant;

/**
 * The session, plus the token itself for clients that send it as {@code Authorization: Bearer} (scripts such as the
 * curl examples in the README). The web frontend ignores it and relies on the HttpOnly cookie.
 */
public record LoginResponse(String username, Role role, Instant expiresAt, String token) {
}
