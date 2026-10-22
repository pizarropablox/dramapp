package cl.dramapp.backend.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import cl.dramapp.backend.event.Event;

class RefundTests {

	private final Event event = new Event("DRAMA Octubre", LocalDate.of(2026, 10, 31));

	@Test
	void aNewRefundIsActiveWithItsReasonStripped() {
		Refund refund = new Refund(event, 15000, "  se acabó el Jack ");

		assertThat(refund.getStatus()).isEqualTo(RefundStatus.ACTIVE);
		assertThat(refund.isVoided()).isFalse();
		assertThat(refund.getAmount()).isEqualTo(15000);
		assertThat(refund.getReason()).isEqualTo("se acabó el Jack");
		assertThat(refund.getVoidedAt()).isNull();
	}

	@Test
	void rejectsAnAmountThatIsNotPositive() {
		for (long amount : new long[] { 0, -1 }) {
			assertThatThrownBy(() -> new Refund(event, amount, "prueba")).isInstanceOf(IllegalArgumentException.class);
		}
	}

	@Test
	void rejectsAMissingOrBlankReason() {
		for (String reason : new String[] { null, "", "   " }) {
			assertThatThrownBy(() -> new Refund(event, 1000, reason)).isInstanceOf(IllegalArgumentException.class);
		}
	}

	@Test
	void voidMarksTheRefundVoidedWithTheTime() {
		Refund refund = new Refund(event, 15000, "prueba");
		Instant before = Instant.now();

		refund.voidRefund();

		assertThat(refund.getStatus()).isEqualTo(RefundStatus.VOIDED);
		assertThat(refund.isVoided()).isTrue();
		assertThat(refund.getVoidedAt()).isBetween(before, Instant.now());
	}

	@Test
	void cannotVoidTwice() {
		Refund refund = new Refund(event, 15000, "prueba");
		refund.voidRefund();
		Instant voidedAt = refund.getVoidedAt();

		assertThatThrownBy(refund::voidRefund).isInstanceOf(IllegalStateException.class);
		assertThat(refund.getVoidedAt()).isEqualTo(voidedAt);
	}

}
