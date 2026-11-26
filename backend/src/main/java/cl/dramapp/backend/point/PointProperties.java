package cl.dramapp.backend.point;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.util.StringUtils;

/**
 * Charging with the Point Smart, from environment variables (see application.yml). Without terminals it is off and
 * everything works as before.
 *
 * @param accessToken Mercado Pago's production token; never logged
 * @param terminals {@code id=name;id=name}, what the phones can choose from
 * @param printOnTerminal {@code no_ticket}, or {@code seller_ticket} for Mercado Pago's own receipt
 * @param keyPrefix starts every idempotency key, so a local and a production sale never share one
 * @param baseUrl Mercado Pago's API
 */
@ConfigurationProperties("dramapp.point")
public record PointProperties(String accessToken, String terminals, String printOnTerminal, String keyPrefix,
		String baseUrl) {

	private static final String NO_TICKET = "no_ticket";

	private static final Set<String> TICKETS = Set.of(NO_TICKET, "seller_ticket");

	/** A variable left blank in Render's panel counts as not set. */
	public PointProperties {
		printOnTerminal = StringUtils.hasText(printOnTerminal) ? printOnTerminal.strip() : NO_TICKET;
	}

	/** @param name what the bar reads, e.g. «Smart 1» */
	public record Terminal(String id, String name) {
	}

	/** In the order given. Empty when the Point is off. */
	public List<Terminal> terminalList() {
		List<Terminal> list = new ArrayList<>();
		if (!StringUtils.hasText(terminals)) {
			return list;
		}
		for (String entry : terminals.split(";")) {
			if (!StringUtils.hasText(entry)) {
				continue;
			}
			int equals = entry.indexOf('=');
			String id = equals < 0 ? "" : entry.substring(0, equals).strip();
			String name = equals < 0 ? "" : entry.substring(equals + 1).strip();
			if (id.isEmpty() || name.isEmpty() || id.length() > 64) {
				throw new IllegalStateException("DRAMAPP_POINT_TERMINALS must be id=name;id=name");
			}
			list.add(new Terminal(id, name));
		}
		return list;
	}

	public Optional<Terminal> terminal(String id) {
		return terminalList().stream().filter(terminal -> terminal.id().equals(id)).findFirst();
	}

	/** Fails fast on a half-configured Point. Nothing is required while it is off. */
	void validate() {
		if (terminalList().isEmpty()) {
			return;
		}
		if (!StringUtils.hasText(accessToken)) {
			throw new IllegalStateException("DRAMAPP_POINT_ACCESS_TOKEN is required");
		}
		if (keyPrefix == null || !keyPrefix.matches("[a-z0-9]{1,12}")) {
			throw new IllegalStateException("DRAMAPP_POINT_KEY_PREFIX is required: 1 to 12 lowercase letters or digits");
		}
		if (!TICKETS.contains(printOnTerminal)) {
			throw new IllegalStateException("DRAMAPP_POINT_PRINT_ON_TERMINAL must be one of " + TICKETS);
		}
	}

	/** Without the token: a record prints every component. */
	@Override
	public String toString() {
		return "PointProperties[terminals=" + terminals + ", printOnTerminal=" + printOnTerminal + ", keyPrefix="
				+ keyPrefix + "]";
	}

}
