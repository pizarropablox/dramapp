package cl.dramapp.backend.point;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.Sale;

class PointOrderTests {

	private static PointOrder order() {
		Event event = new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 27));
		Sale sale = new Sale(event, PaymentMethod.MERCADO_PAGO, 17000, 1000);
		return new PointOrder(sale, "SMART-1", "test-sale-1", "barra");
	}

	private static PointOrder order(String status) {
		PointOrder order = order();
		order.recordStatus(status, null);
		return order;
	}

	@Test
	void chargesTheProductsPlusTheTip() {
		assertThat(order().getAmount()).isEqualTo(18000);
	}

	@Test
	void aNewOrderHoldsItsTerminalUntilMercadoPagoAnswers() {
		PointOrder order = order();

		assertThat(order.getStatus()).isNull();
		assertThat(order.isOpen()).isTrue();
		assertThat(order.isSettled()).isFalse();
	}

	@ParameterizedTest
	@ValueSource(strings = { "created", "at_terminal", "action_required" })
	void theseStatusesHoldTheTerminal(String status) {
		assertThat(order(status).isOpen()).isTrue();
		assertThat(order(status).isSettled()).isFalse();
	}

	@ParameterizedTest
	@ValueSource(strings = { "processed", "canceled", "expired", "failed", "refunded" })
	void theseStatusesAreFinal(String status) {
		assertThat(order(status).isOpen()).isFalse();
		assertThat(order(status).isSettled()).isTrue();
	}

	@Test
	void anUnknownStatusIsKeptAsItComesWithoutBeingAnOutcome() {
		PointOrder order = order("something_new");

		assertThat(order.getStatus()).isEqualTo("something_new");
		assertThat(order.isOpen()).isFalse();
		assertThat(order.isSettled()).isFalse();
	}

	@ParameterizedTest
	@CsvSource({ "processed, at_terminal, processed", "processed, canceled, processed",
			"processed, refunded, refunded", "refunded, processed, refunded", "canceled, at_terminal, canceled",
			"canceled, expired, canceled", "expired, created, expired", "failed, at_terminal, failed",
			"canceled, processed, processed", "expired, processed, processed", "failed, processed, processed",
			"expired, refunded, refunded", "at_terminal, created, created",
			"action_required, processed, processed" })
	void aLateAnswerNeverTakesBackAnOutcomeExceptForAPayment(String before, String answer, String after) {
		PointOrder order = order(before);

		order.recordStatus(answer, null);

		assertThat(order.getStatus()).isEqualTo(after);
	}

	@Test
	void aVeryLongStatusFitsItsColumn() {
		assertThat(order("x".repeat(200)).getStatus()).hasSize(64);
	}

	@Test
	void anAttemptWithoutAnswerIsUncertainUntilItIsRepeated() {
		PointOrder order = order();
		assertThat(order.isBeingSent()).isTrue();

		order.endAttemptWithoutAnswer();
		assertThat(order.isBeingSent()).isFalse();
		assertThat(order.isUncertain()).isTrue();

		order.startAttempt();
		assertThat(order.isBeingSent()).isTrue();

		order.recordStatus("created", "created");
		assertThat(order.isBeingSent()).isFalse();
		assertThat(order.isUncertain()).isFalse();
	}

	@Test
	void checkingWithoutChangesOnlyMovesTheLastCheck() {
		PointOrder order = order("at_terminal");
		Instant updatedAt = order.getUpdatedAt();
		Instant before = Instant.now();

		order.recordStatus("at_terminal", null);

		assertThat(order.getUpdatedAt()).isEqualTo(updatedAt);
		assertThat(order.getLastCheckedAt()).isAfterOrEqualTo(before);
	}

	@Test
	void aRejectedCreationFreesTheTerminal() {
		PointOrder order = order();

		order.rejectCreation("minimum_amount_not_met");

		assertThat(order.getCreationError()).isEqualTo("minimum_amount_not_met");
		assertThat(order.isOpen()).isFalse();
		assertThat(order.isSettled()).isTrue();
		assertThatThrownBy(() -> order.recordStatus("created", null)).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void anOrderThatExistsCannotBeRejected() {
		PointOrder order = order("created");

		assertThatThrownBy(() -> order.rejectCreation("any")).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void closedByHandAsPaidIsPendingUntilMercadoPagoShowsThePayment() {
		PointOrder order = order("action_required");
		Instant before = Instant.now();

		order.closeByHand(PointOrderOutcome.PAID, "barra");

		assertThat(order.isOpen()).isFalse();
		assertThat(order.isPendingVerification()).isTrue();
		assertThat(order.getStatus()).isEqualTo("action_required");
		assertThat(order.getResolvedBy()).isEqualTo("barra");
		assertThat(order.getResolvedAt()).isBetween(before, Instant.now());

		order.recordStatus("at_terminal", null);
		assertThat(order.isPendingVerification()).isTrue();
		assertThat(order.isOpen()).isFalse();

		order.recordStatus("processed", "accredited");
		assertThat(order.isPendingVerification()).isFalse();
		assertThat(order.getResolvedOutcome()).isEqualTo(PointOrderOutcome.PAID);
	}

	@Test
	void closedByHandAsPaidStaysPendingIfMercadoPagoSaysItWasNotCharged() {
		PointOrder order = order("action_required");
		order.closeByHand(PointOrderOutcome.PAID, "barra");

		order.recordStatus("canceled", null);

		assertThat(order.isPendingVerification()).isTrue();
	}

	@Test
	void closedByHandAsPaidWithoutAnyAnswerIsPending() {
		PointOrder order = order();

		order.closeByHand(PointOrderOutcome.PAID, "barra");

		assertThat(order.isPendingVerification()).isTrue();
	}

	@Test
	void closedByHandAsNotPaidIsNotPending() {
		PointOrder order = order("action_required");

		order.closeByHand(PointOrderOutcome.NOT_PAID, "admin");

		assertThat(order.isPendingVerification()).isFalse();
		assertThat(order.isOpen()).isFalse();
	}

	@ParameterizedTest
	@ValueSource(strings = { "processed", "refunded" })
	void closedByHandAsNotPaidIsPaidOnceMercadoPagoShowsThePayment(String status) {
		PointOrder order = order("action_required");
		order.closeByHand(PointOrderOutcome.NOT_PAID, "barra");
		assertThat(order.getState()).isEqualTo(PointOrderState.CANCELED);

		order.recordStatus(status, null);

		assertThat(order.getState()).isEqualTo(PointOrderState.PAID);
	}

	@ParameterizedTest
	@CsvSource(nullValues = "-", value = {
			// before, what Mercado Pago says, now, contradicts
			"NOT_PAID, -, PAID, true", "NOT_PAID, action_required, PAID, true", "NOT_PAID, at_terminal, PAID, true",
			"NOT_PAID, something_new, PAID, true", "NOT_PAID, canceled, PAID, false", "NOT_PAID, expired, PAID, false",
			"NOT_PAID, failed, PAID, false", "NOT_PAID, processed, PAID, false", "NOT_PAID, refunded, PAID, false",
			"NOT_PAID, action_required, NOT_PAID, false", "PAID, -, NOT_PAID, true",
			"PAID, action_required, NOT_PAID, true", "PAID, canceled, NOT_PAID, true",
			"PAID, processed, NOT_PAID, false", "PAID, -, PAID, false" })
	void closedWithTheOtherOutcomeContradictsUnlessMercadoPagoSettlesIt(PointOrderOutcome before, String status,
			PointOrderOutcome now, boolean contradicts) {
		PointOrder order = order("action_required");
		order.closeByHand(before, "barra");
		if (status != null) {
			order.recordStatus(status, null);
		}

		assertThat(order.contradicts(now)).isEqualTo(contradicts);
	}

	@Test
	void whatWasNotClosedByHandContradictsNothing() {
		assertThat(order("action_required").contradicts(PointOrderOutcome.PAID)).isFalse();
		assertThat(order("canceled").contradicts(PointOrderOutcome.PAID)).isFalse();
	}

	@Test
	void paidByMercadoPagoIsNeverPending() {
		assertThat(order("processed").isPendingVerification()).isFalse();
	}

	@Test
	void anOrderWithAnOutcomeCannotBeClosedByHand() {
		PointOrder closed = order("action_required");
		closed.closeByHand(PointOrderOutcome.NOT_PAID, "barra");
		PointOrder rejected = order();
		rejected.rejectCreation("any");

		for (PointOrder order : new PointOrder[] { closed, rejected, order("processed"), order("canceled") }) {
			assertThatThrownBy(() -> order.closeByHand(PointOrderOutcome.PAID, "barra"))
				.isInstanceOf(IllegalStateException.class);
		}
		assertThat(closed.getResolvedOutcome()).isEqualTo(PointOrderOutcome.NOT_PAID);
	}

}
