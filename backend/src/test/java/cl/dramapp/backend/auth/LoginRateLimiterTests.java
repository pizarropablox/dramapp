package cl.dramapp.backend.auth;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class LoginRateLimiterTests {

	private static final String CLIENT = "203.0.113.7";

	private final MutableClock clock = new MutableClock(Instant.parse("2026-10-24T23:00:00Z"));

	private final LoginRateLimiter limiter = new LoginRateLimiter(clock);

	private void fail(String client, int times) {
		for (int i = 0; i < times; i++) {
			limiter.recordFailure(client);
		}
	}

	@Test
	void allowsAClientWithoutFailures() {
		assertThat(limiter.retryAfter(CLIENT)).isEmpty();
	}

	@Test
	void allowsFourFailuresAndBlocksAtTheFifth() {
		fail(CLIENT, 4);
		assertThat(limiter.retryAfter(CLIENT)).isEmpty();

		limiter.recordFailure(CLIENT);

		assertThat(limiter.retryAfter(CLIENT)).contains(Duration.ofMinutes(5));
	}

	@Test
	void theBlockEndsWhenTheOldestFailureLeavesTheWindow() {
		fail(CLIENT, 1);
		clock.advance(Duration.ofMinutes(2));
		fail(CLIENT, 4);

		assertThat(limiter.retryAfter(CLIENT)).contains(Duration.ofMinutes(3));

		clock.advance(Duration.ofMinutes(3));
		assertThat(limiter.retryAfter(CLIENT)).isEmpty();
	}

	@Test
	void otherClientsAreNotBlocked() {
		fail(CLIENT, 5);

		assertThat(limiter.retryAfter("198.51.100.1")).isEmpty();
	}

	@Test
	void aSuccessfulLoginClearsTheClientsFailures() {
		fail(CLIENT, 4);

		limiter.recordSuccess(CLIENT);
		fail(CLIENT, 4);

		assertThat(limiter.retryAfter(CLIENT)).isEmpty();
	}

	@Test
	void tooManyFailuresOverallBlockEveryoneForAMinute() {
		for (int i = 0; i < LoginRateLimiter.MAX_FAILURES_OVERALL; i++) {
			limiter.recordFailure("198.51.100." + i);
		}

		assertThat(limiter.retryAfter(CLIENT)).contains(Duration.ofMinutes(1));

		clock.advance(Duration.ofMinutes(1));
		assertThat(limiter.retryAfter(CLIENT)).isEmpty();
	}

	@Test
	void keepsCountingRecentFailuresAfterForgettingExpiredClients() {
		for (int i = 0; i <= LoginRateLimiter.MAX_TRACKED_CLIENTS; i++) {
			limiter.recordFailure("client-" + i);
		}
		clock.advance(LoginRateLimiter.CLIENT_WINDOW.plusSeconds(1));
		fail(CLIENT, 1);

		// Everyone but CLIENT expired and was dropped; CLIENT's failure still counts.
		fail(CLIENT, 4);
		assertThat(limiter.retryAfter(CLIENT)).isPresent();
		assertThat(limiter.retryAfter("client-0")).isEmpty();
	}

	private static final class MutableClock extends Clock {

		private Instant now;

		MutableClock(Instant now) {
			this.now = now;
		}

		void advance(Duration duration) {
			now = now.plus(duration);
		}

		@Override
		public Instant instant() {
			return now;
		}

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

	}

}
