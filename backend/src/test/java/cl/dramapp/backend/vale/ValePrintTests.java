package cl.dramapp.backend.vale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;

import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.Sale;

class ValePrintTests {

	private final ValePrint print = new ValePrint(
			new Sale(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 27)), PaymentMethod.EFECTIVO, 17000, 0),
			"SMART-1", ValePrintKind.ORIGINAL, "barra");

	@Test
	void aNewPrintHasNoAnswerYet() {
		assertThat(print.getMpActionId()).isNull();
		assertThat(print.getStatus()).isNull();
		assertThat(print.isRejected()).isFalse();
		assertThat(print.getUpdatedAt()).isEqualTo(print.getRequestedAt());
	}

	@Test
	void anAcceptedPrintCannotBeRejected() {
		Instant before = Instant.now();

		print.recordAction("ACT1", "created");

		assertThat(print.getMpActionId()).isEqualTo("ACT1");
		assertThat(print.getStatus()).isEqualTo("created");
		assertThat(print.getUpdatedAt()).isAfterOrEqualTo(before);
		assertThatThrownBy(() -> print.reject("any")).isInstanceOf(IllegalStateException.class);
		assertThat(print.isRejected()).isFalse();
	}

	@Test
	void aRejectedPrintCannotBeAccepted() {
		print.reject("already_queued_order_on_terminal");

		assertThat(print.isRejected()).isTrue();
		assertThat(print.getError()).isEqualTo("already_queued_order_on_terminal");
		assertThatThrownBy(() -> print.recordAction("ACT1", "created")).isInstanceOf(IllegalStateException.class);
		assertThat(print.getMpActionId()).isNull();
	}

}
