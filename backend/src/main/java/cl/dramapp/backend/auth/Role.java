package cl.dramapp.backend.auth;

import java.util.Collection;
import java.util.Locale;

import org.springframework.security.core.GrantedAuthority;

/**
 * The two shared accounts. Each role logs in with the user of the same name in lowercase ({@code barra},
 * {@code admin}). ADMIN includes everything BARRA can do (see the role hierarchy in {@link SecurityConfig}).
 */
public enum Role {

	BARRA, ADMIN;

	public String username() {
		return name().toLowerCase(Locale.ROOT);
	}

	public String authority() {
		return "ROLE_" + name();
	}

	static Role fromAuthorities(Collection<? extends GrantedAuthority> authorities) {
		for (Role role : values()) {
			if (authorities.stream().anyMatch(authority -> role.authority().equals(authority.getAuthority()))) {
				return role;
			}
		}
		throw new IllegalArgumentException("No DRAMApp role in " + authorities);
	}

}
