package cl.dramapp.backend.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * Slows down password guessing, in memory (one instance, a few phones).
 * <ul>
 * <li>Per client IP: at most {@value #MAX_FAILURES_PER_CLIENT} failed logins in {@link #CLIENT_WINDOW}.</li>
 * <li>Overall: at most {@value #MAX_FAILURES_OVERALL} failed logins in {@link #OVERALL_WINDOW}, which also caps the
 * CPU spent on bcrypt (about a second each on Render's 0.1 CPU).</li>
 * </ul>
 * Never locks out a user: an attacker could otherwise keep the cashier out during the party. Blocked attempts do not
 * check the password, and open sessions are never affected. If Render's proxy hides the client IP, every login looks
 * like the same client and the per-client limit acts as a global one.
 */
@Component
public class LoginRateLimiter {

	static final int MAX_FAILURES_PER_CLIENT = 5;

	static final Duration CLIENT_WINDOW = Duration.ofMinutes(5);

	static final int MAX_FAILURES_OVERALL = 30;

	static final Duration OVERALL_WINDOW = Duration.ofMinutes(1);

	/** Above this many clients with failures, the expired ones are dropped. */
	static final int MAX_TRACKED_CLIENTS = 1_000;

	private final Clock clock;

	private final Map<String, Deque<Instant>> failuresByClient = new HashMap<>();

	private final Deque<Instant> allFailures = new ArrayDeque<>();

	@Autowired
	public LoginRateLimiter() {
		this(Clock.systemUTC());
	}

	LoginRateLimiter(Clock clock) {
		this.clock = clock;
	}

	/** How long the client must wait before trying again, or empty if it may try now. */
	public synchronized Optional<Duration> retryAfter(String client) {
		Instant now = clock.instant();
		Duration wait = Duration.ZERO;
		wait = longest(wait, waitFor(allFailures, MAX_FAILURES_OVERALL, OVERALL_WINDOW, now));
		Deque<Instant> clientFailures = failuresByClient.get(client);
		if (clientFailures != null) {
			wait = longest(wait, waitFor(clientFailures, MAX_FAILURES_PER_CLIENT, CLIENT_WINDOW, now));
		}
		return wait.isZero() ? Optional.empty() : Optional.of(wait);
	}

	public synchronized void recordFailure(String client) {
		Instant now = clock.instant();
		allFailures.addLast(now);
		failuresByClient.computeIfAbsent(client, key -> new ArrayDeque<>()).addLast(now);
		if (failuresByClient.size() > MAX_TRACKED_CLIENTS) {
			failuresByClient.values().forEach(failures -> dropBefore(failures, now.minus(CLIENT_WINDOW)));
			failuresByClient.values().removeIf(Deque::isEmpty);
		}
	}

	public synchronized void recordSuccess(String client) {
		failuresByClient.remove(client);
	}

	private static Duration waitFor(Deque<Instant> failures, int max, Duration window, Instant now) {
		dropBefore(failures, now.minus(window));
		if (failures.size() < max) {
			return Duration.ZERO;
		}
		// Sliding window: one more attempt is allowed once the oldest failure leaves it.
		return Duration.between(now, failures.peekFirst().plus(window));
	}

	private static void dropBefore(Deque<Instant> failures, Instant start) {
		while (!failures.isEmpty() && !failures.peekFirst().isAfter(start)) {
			failures.removeFirst();
		}
	}

	private static Duration longest(Duration a, Duration b) {
		return a.compareTo(b) >= 0 ? a : b;
	}

}
