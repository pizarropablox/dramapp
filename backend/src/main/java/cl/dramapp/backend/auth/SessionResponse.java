package cl.dramapp.backend.auth;

import java.time.Instant;

/** Who is logged in and until when; the frontend cannot read the HttpOnly cookie, so it asks for this. */
public record SessionResponse(String username, Role role, Instant expiresAt) {
}
