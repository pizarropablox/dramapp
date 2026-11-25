package cl.dramapp.backend.point;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import cl.dramapp.backend.point.FakeMercadoPagoClient.Failure;
import cl.dramapp.backend.sale.PaymentMethod;

/** Cancelling, voiding, closing by hand and what is forbidden while a charge is open. */
@WithMockUser(username = "barra", roles = "BARRA")
class PointOrderOutcomeTests extends PointScenario {

	private MvcTestResult cancel(long saleId) {
		return post("/api/sales/" + saleId + "/point-order/cancel", "");
	}

	private MvcTestResult resolve(long saleId, String outcome) {
		return post("/api/sales/" + saleId + "/point-order/resolve", "{\"outcome\": \"" + outcome + "\"}");
	}

	private MvcTestResult voidSale(long saleId) {
		return post("/api/sales/" + saleId + "/void", "{}");
	}

	private long sentSale() {
		long sale = cardSale();
		send(sale);
		mercadoPago.orderBecomes(mpOrderId(), "at_terminal", "at_terminal");
		return sale;
	}

	private static void assertProblem(MvcTestResult result, HttpStatus status, String code) {
		assertThat(result).hasStatus(status);
		assertThat(result).bodyJson().extractingPath("$.code").isEqualTo(code);
	}

	private static void assertState(MvcTestResult result, String state) {
		assertThat(result).hasStatus(HttpStatus.OK).bodyJson().extractingPath("$.state").isEqualTo(state);
	}

	private void assertVoided(long saleId, String reason) {
		assertThat(loadSale(saleId).isVoided()).isTrue();
		assertThat(loadSale(saleId).getVoidReason()).isEqualTo(reason);
	}

	private void assertActive(long saleId) {
		assertThat(loadSale(saleId).isVoided()).isFalse();
	}

	@Test
	void askingToCancelDoesNotVoidUntilMercadoPagoSaysCanceled() {
		long sale = sentSale();

		assertState(cancel(sale), "CANCELING");
		assertActive(sale);
		assertState(follow(sale), "CANCELING");
		assertActive(sale);

		mercadoPago.orderBecomes(mpOrderId(), "canceled", "canceled");
		var result = follow(sale);
		assertState(result, "CANCELED");
		assertThat(result).bodyJson().isLenientlyEqualTo("""
				{"saleStatus": "VOIDED", "voidReason": "Vuelta al carrito (no cobrada)", "cancelRequested": true}""");
		assertVoided(sale, "Vuelta al carrito (no cobrada)");
	}

	@Test
	void anOrderTheSmartHasNotTakenIsCanceledAtOnce() {
		long sale = cardSale();
		send(sale);

		assertState(cancel(sale), "CANCELED");
		assertVoided(sale, "Vuelta al carrito (no cobrada)");
	}

	@Test
	void paidWhileCancelingStaysPaid() {
		long sale = sentSale();
		cancel(sale);
		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");

		assertState(follow(sale), "PAID");
		assertActive(sale);
		assertThat(order(sale).isPaidOnVoidedSale()).isFalse();
	}

	@Test
	void cancelingAPaidSaleSaysItWasPaid() {
		long sale = sentSale();
		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");

		assertState(cancel(sale), "PAID");
		assertActive(sale);
	}

	@ParameterizedTest
	@CsvSource({ "canceled, canceled_by_api, Cancelada en la Point", "canceled, cancel_by_terminal, Cancelada en la Point",
			"canceled, never_seen_before, Cancelada en la Point", "expired, expired, Cobro vencido en la Point",
			"failed, rejected_by_issuer, Pago rechazado en la Point" })
	void whatHappensOnTheSmartVoidsWithItsReason(String status, String detail, String reason) {
		long sale = sentSale();

		mercadoPago.orderBecomes(mpOrderId(), status, detail);

		assertState(follow(sale), "CANCELED");
		assertVoided(sale, reason);
	}

	@Test
	void anExpiredOrderIsAlsoCanceledToClearTheScreenOnce() {
		long sale = sentSale();
		mercadoPago.orderBecomes(mpOrderId(), "expired", "expired");

		follow(sale);

		assertThat(mercadoPago.calls("cancelOrder")).containsExactly("cancelOrder " + mpOrderId());
		assertThat(order(sale).getStatus()).isEqualTo("expired");
	}

	@ParameterizedTest
	@ValueSource(strings = { "canceled", "expired", "failed" })
	void aPaymentOnAVoidedSaleIsMarkedAndNotFixed(String status) {
		long sale = sentSale();
		mercadoPago.orderBecomes(mpOrderId(), status, status);
		follow(sale);
		assertVoided(sale, loadSale(sale).getVoidReason());

		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		var result = follow(sale);

		assertThat(result).bodyJson().isLenientlyEqualTo("""
				{"state": "PAID", "saleStatus": "VOIDED", "paidOnVoidedSale": true}""");
		assertThat(loadSale(sale).isVoided()).isTrue();
	}

	@Test
	void withoutAnOrderGoingBackVoidsAtOnce() {
		long neverSent = cardSale();
		long rejected = cardSale();
		mercadoPago.failNextOrder(Failure.REJECTED);
		send(rejected);

		assertState(cancel(neverSent), "NOT_SENT");
		assertState(cancel(rejected), "NOT_SENT");

		assertVoided(neverSent, "Vuelta al carrito (no cobrada)");
		assertVoided(rejected, "Vuelta al carrito (no cobrada)");
		assertState(cancel(neverSent), "NOT_SENT");
		assertThat(mercadoPago.calls("cancelOrder")).isEmpty();
	}

	@Test
	void aCashSaleIsNotCanceledHere() {
		long sale = sale(PaymentMethod.EFECTIVO);

		assertProblem(cancel(sale), HttpStatus.CONFLICT, "SALE_NOT_CHARGEABLE");
		assertActive(sale);
	}

	@Test
	void aLostAnswerIsFoundWithTheSameKeyAndThenCanceled() {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.CREATED_BUT_LOST);
		send(sale);

		assertState(cancel(sale), "CANCELED");

		assertThat(mercadoPago.calls("createOrder")).containsOnly("createOrder test-sale-" + sale);
		assertThat(mercadoPago.orderIds()).hasSize(1);
		assertThat(mercadoPago.calls("cancelOrder")).containsExactly("cancelOrder " + mpOrderId());
		assertVoided(sale, "Vuelta al carrito (no cobrada)");
	}

	@Test
	void withoutKnowingTheOrderTheSaleIsNotVoided() {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.CREATED_BUT_LOST);
		send(sale);

		mercadoPago.failNextOrder(Failure.BUSY);
		assertProblem(cancel(sale), HttpStatus.CONFLICT, "POINT_UNCERTAIN");
		mercadoPago.down(true);
		assertProblem(cancel(sale), HttpStatus.BAD_GATEWAY, "POINT_UNAVAILABLE");

		assertActive(sale);
	}

	@Test
	void aCancelWithoutAnswerCanBeRepeated() {
		long sale = sentSale();
		mercadoPago.down(true);
		assertProblem(cancel(sale), HttpStatus.BAD_GATEWAY, "POINT_UNAVAILABLE");
		assertActive(sale);

		mercadoPago.down(false);
		assertState(cancel(sale), "CANCELING");
		assertThat(mercadoPago.calls("cancelOrder")).hasSize(2);
	}

	@Test
	void anOrderThatNeedsAttentionCannotBeCanceled() {
		long sale = sentSale();
		mercadoPago.orderBecomes(mpOrderId(), "action_required", "check_on_terminal");

		assertProblem(cancel(sale), HttpStatus.CONFLICT, "POINT_CANNOT_CANCEL");
		assertActive(sale);
	}

	@Test
	void anOrderThatNeedsAttentionIsClosedByHandAsPaid() {
		long sale = sentSale();
		mercadoPago.orderBecomes(mpOrderId(), "action_required", "check_on_terminal");

		var result = resolve(sale, "PAID");

		assertState(result, "PAID");
		assertThat(result).bodyJson().isLenientlyEqualTo("""
				{"pendingVerification": true, "saleStatus": "ACTIVE"}""");
		assertThat(order(sale).getResolvedBy()).isEqualTo("barra");
		assertThat(order(sale).getResolvedAt()).isNotNull();

		// The terminal is free, and Mercado Pago may verify it later.
		assertThat(send(cardSale(), SMART_2)).hasStatus(HttpStatus.CREATED);
		mercadoPago.orderBecomes(order(sale).getMpOrderId(), "processed", "accredited");
		assertThat(follow(sale)).bodyJson().extractingPath("$.pendingVerification").isEqualTo(false);
	}

	@Test
	void closedByHandAsNotPaidVoids() {
		long sale = sentSale();
		mercadoPago.orderBecomes(mpOrderId(), "action_required", "check_on_terminal");

		assertState(resolve(sale, "NOT_PAID"), "CANCELED");
		assertVoided(sale, "Vuelta al carrito (no cobrada)");
	}

	@Test
	void closedByHandAsPaidIsNeverVoidedByMercadoPago() {
		long sale = sentSale();
		mercadoPago.orderBecomes(mpOrderId(), "action_required", "check_on_terminal");
		resolve(sale, "PAID");

		mercadoPago.orderBecomes(mpOrderId(), "canceled", "canceled");
		var result = follow(sale);

		assertState(result, "PAID");
		assertThat(result).bodyJson().extractingPath("$.pendingVerification").isEqualTo(true);
		assertActive(sale);
	}

	@Test
	void whenMercadoPagoDoesNotAnswerItCanBeClosedByHand() {
		long sale = sentSale();
		mercadoPago.down(true);

		assertState(resolve(sale, "NOT_PAID"), "CANCELED");
		assertVoided(sale, "Vuelta al carrito (no cobrada)");
	}

	@Test
	void whatCouldNotBeCanceledBecauseMercadoPagoFellIsClosedByHand() {
		long sale = sentSale();
		mercadoPago.down(true);
		assertProblem(cancel(sale), HttpStatus.BAD_GATEWAY, "POINT_UNAVAILABLE");

		assertState(resolve(sale, "NOT_PAID"), "CANCELED");
		assertVoided(sale, "Vuelta al carrito (no cobrada)");
		mercadoPago.down(false);
	}

	@Test
	void anUnknownOrderCanBeClosedByHandWithoutSendingItsKeyAgain() {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.LOST);
		send(sale);

		assertState(resolve(sale, "PAID"), "PAID");

		assertThat(order(sale).isPendingVerification()).isTrue();
		assertThat(mercadoPago.calls("createOrder")).hasSize(1);
		assertState(follow(sale), "PAID");
		assertState(send(sale), "PAID");
		assertThat(mercadoPago.calls("createOrder")).hasSize(1);
	}

	@Test
	void aChargeThatCanBeFollowedIsNotClosedByHand() {
		long sale = sentSale();

		assertProblem(resolve(sale, "PAID"), HttpStatus.CONFLICT, "POINT_NOT_CLOSABLE");
		cancel(sale);
		assertProblem(resolve(sale, "NOT_PAID"), HttpStatus.CONFLICT, "POINT_NOT_CLOSABLE");
		assertActive(sale);
	}

	@Test
	void mercadoPagosOutcomeWinsOverTheHand() {
		long sale = sentSale();
		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");

		assertState(resolve(sale, "NOT_PAID"), "PAID");
		assertThat(order(sale).getResolvedOutcome()).isNull();
		assertActive(sale);
	}

	@Test
	void theOutcomeIsRequired() {
		long sale = sentSale();

		assertThat(post("/api/sales/" + sale + "/point-order/resolve", "{}")).hasStatus(HttpStatus.BAD_REQUEST);
		assertThat(resolve(sale, "MAYBE")).hasStatus(HttpStatus.BAD_REQUEST);
	}

	@Test
	void aSaleWithAnOpenChargeIsNotVoidedByHand() {
		long sale = sentSale();

		assertProblem(voidSale(sale), HttpStatus.CONFLICT, "POINT_ORDER_OPEN");
		assertActive(sale);

		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		follow(sale);
		assertThat(voidSale(sale)).hasStatus(HttpStatus.OK);
	}

	@Test
	void aRejectedOrderDoesNotForbidVoiding() {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.REJECTED);
		send(sale);

		assertThat(voidSale(sale)).hasStatus(HttpStatus.OK);
	}

	@Test
	@WithMockUser(username = "admin", roles = "ADMIN")
	void anEventWithAnOpenChargeIsNotClosed() {
		long sale = sentSale();
		String close = "/api/events/" + event.getId() + "/close";

		var result = post(close, "");
		assertProblem(result, HttpStatus.CONFLICT, "POINT_ORDER_OPEN");
		assertThat(result).bodyJson().extractingPath("$.saleId").isEqualTo((int) sale);

		mercadoPago.orderBecomes(mpOrderId(), "something_new", null);
		follow(sale);
		assertProblem(post(close, ""), HttpStatus.CONFLICT, "POINT_ORDER_OPEN");

		resolve(sale, "PAID");
		assertThat(post(close, "")).hasStatus(HttpStatus.OK);
	}

}
