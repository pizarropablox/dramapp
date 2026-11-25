package cl.dramapp.backend.point;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.LongStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import cl.dramapp.backend.point.FakeMercadoPagoClient.Failure;
import cl.dramapp.backend.sale.PaymentMethod;

@WithMockUser(username = "barra", roles = "BARRA")
class PointOrderControllerTests extends PointScenario {

	@Autowired
	private PointOrderService pointOrderService;

	private static void assertProblem(MvcTestResult result, HttpStatus status, String code) {
		assertThat(result).hasStatus(status);
		assertThat(result).bodyJson().extractingPath("$.code").isEqualTo(code);
	}

	private static void assertState(MvcTestResult result, String state) {
		assertThat(result).hasStatus2xxSuccessful().bodyJson().extractingPath("$.state").isEqualTo(state);
	}

	@Test
	void sendsProductsPlusTipWithAKeyOfTheSale() {
		long sale = cardSale();

		var result = send(sale);

		assertThat(result).hasStatus(HttpStatus.CREATED).bodyJson().isLenientlyEqualTo("""
				{"saleId": %d, "state": "SENT", "status": "created", "amount": 18000, "terminalId": "SMART-1",
				 "terminalName": "Smart 1", "cancelRequested": false, "saleStatus": "ACTIVE",
				 "pendingVerification": false, "paidOnVoidedSale": false}""".formatted(sale));
		assertThat(mercadoPago.calls()).containsExactly("createOrder test-sale-" + sale);
		assertThat(mercadoPago.orderAmount(mpOrderId())).isEqualTo(18000);
		assertThat(order(sale).getCreatedBy()).isEqualTo("barra");
		assertThat(order(sale).getMpOrderId()).isEqualTo(mpOrderId());
	}

	@Test
	void sendingAgainNeverCreatesTwoOrders() {
		long sale = cardSale();
		send(sale);

		assertThat(send(sale)).hasStatus(HttpStatus.OK);
		assertThat(send(sale, SMART_2)).hasStatus(HttpStatus.OK);

		assertThat(mercadoPago.orderIds()).hasSize(1);
		assertThat(mercadoPago.calls("createOrder")).hasSize(1);
		assertThat(pointOrderRepository.countBySaleId(sale)).isEqualTo(1);
	}

	@Test
	void aPaidSaleIsNotSentAgain() {
		long sale = cardSale();
		send(sale);
		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		follow(sale);

		assertState(send(sale), "PAID");
		assertThat(mercadoPago.orderIds()).hasSize(1);
	}

	@Test
	void followsTheOrderUntilItIsPaid() {
		long sale = cardSale();
		send(sale);

		assertState(follow(sale), "SENT");
		mercadoPago.orderBecomes(mpOrderId(), "at_terminal", "at_terminal");
		assertState(follow(sale), "WAITING");
		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		assertState(follow(sale), "PAID");

		PointOrder paid = order(sale);
		assertThat(paid.getReferenceId()).isEqualTo("OP-" + mpOrderId());
		assertThat(paid.getMpPaymentId()).isEqualTo("PAY-" + mpOrderId());
		assertThat(loadSale(sale).isVoided()).isFalse();
	}

	@Test
	void oncePaidItStopsAskingMercadoPago() {
		long sale = cardSale();
		send(sale);
		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		follow(sale);
		int asked = mercadoPago.calls("getOrder").size();

		assertState(follow(sale), "PAID");
		assertThat(mercadoPago.calls("getOrder")).hasSize(asked);
	}

	@ParameterizedTest
	@CsvSource({ "action_required, ATTENTION", "something_new, ATTENTION", "refunded, PAID" })
	void theStateOnlyDependsOnTheStatus(String status, String state) {
		long sale = cardSale();
		send(sale);

		mercadoPago.orderBecomes(mpOrderId(), status, "a_detail_nobody_documented");

		assertState(follow(sale), state);
		assertThat(order(sale).getStatusDetail()).isEqualTo("a_detail_nobody_documented");
		assertThat(loadSale(sale).isVoided()).isFalse();
	}

	@Test
	void aLostAnswerIsAskedAgainWithTheSameKeyAndChargesOnce() {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.CREATED_BUT_LOST);
		assertProblem(send(sale), HttpStatus.BAD_GATEWAY, "POINT_UNAVAILABLE");
		assertState(follow(sale), "SENDING");

		// Meanwhile the Smart took it: the replay answers "created", but the status is asked apart.
		mercadoPago.orderBecomes(mpOrderId(), "at_terminal", "at_terminal");
		var result = send(sale);

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertState(result, "WAITING");
		assertThat(mercadoPago.orderIds()).hasSize(1);
		assertThat(mercadoPago.calls("createOrder"))
			.containsExactly("createOrder test-sale-" + sale, "createOrder test-sale-" + sale);
		assertThat(pointOrderRepository.countBySaleId(sale)).isEqualTo(1);
	}

	@Test
	void theReplayStaysAsItWasIfItsStatusCannotBeRead() {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.LOST);
		send(sale);

		assertState(send(sale), "SENT");
		assertThat(order(sale).getMpOrderId()).isEqualTo(mpOrderId());
	}

	@Test
	void withoutAnAnswerTheTerminalStaysTaken() {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.LOST);
		send(sale);

		long other = cardSale();
		assertProblem(send(other), HttpStatus.CONFLICT, "POINT_BUSY");
		assertThat(mercadoPago.calls("createOrder test-sale-" + other)).isEmpty();
	}

	@ParameterizedTest
	@CsvSource({ "BUSY, 409, POINT_BUSY_UNKNOWN", "NOT_CONFIGURED, 424, POINT_NOT_CONFIGURED",
			"REJECTED, 422, POINT_ORDER_REJECTED" })
	void aRejectionOfTheFirstCallIsDefinitive(Failure failure, int status, String code) {
		long sale = cardSale();
		mercadoPago.failNextOrder(failure);

		assertProblem(send(sale), HttpStatus.valueOf(status), code);

		assertThat(order(sale).getState()).isEqualTo(PointOrderState.NOT_SENT);
		assertThat(loadSale(sale).isVoided()).isFalse();

		// It is sent again as another order, with another key.
		assertThat(send(sale)).hasStatus(HttpStatus.CREATED);
		assertThat(mercadoPago.calls("createOrder"))
			.containsExactly("createOrder test-sale-" + sale, "createOrder test-sale-" + sale + "-2");
		assertThat(pointOrderRepository.countBySaleId(sale)).isEqualTo(2);
	}

	@ParameterizedTest
	@CsvSource({ "BUSY", "NOT_CONFIGURED", "REJECTED", "KEY_USED" })
	void aRejectionAfterALostAnswerProvesNothing(Failure failure) {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.CREATED_BUT_LOST);
		send(sale);
		mercadoPago.failNextOrder(failure);

		assertProblem(send(sale), HttpStatus.CONFLICT, "POINT_UNCERTAIN");

		assertThat(order(sale).getState()).isEqualTo(PointOrderState.SENDING);
		assertThat(order(sale).getCreationError()).isNull();

		// The same key again, so the order that did exist is found.
		assertThat(send(sale)).hasStatus(HttpStatus.CREATED);
		assertThat(mercadoPago.orderIds()).hasSize(1);
		assertThat(mercadoPago.calls("createOrder")).containsOnly("createOrder test-sale-" + sale);
	}

	@Test
	void aUsedKeyIsNeverDefinitive() {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.KEY_USED);

		assertProblem(send(sale), HttpStatus.CONFLICT, "POINT_UNCERTAIN");

		assertThat(order(sale).getState()).isEqualTo(PointOrderState.SENDING);
	}

	@Test
	void aCallInFlightIsNotRepeatedByAnotherPhone() {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.LOST);
		send(sale);
		// As if the first call had just started and not ended.
		jdbcTemplate.update("UPDATE point_order SET last_checked_at = NULL, updated_at = now()");

		assertState(send(sale), "SENDING");
		assertThat(mercadoPago.calls("createOrder")).hasSize(1);

		// The backend died in the middle: after a while it is asked again.
		jdbcTemplate.update("UPDATE point_order SET updated_at = now() - interval '13 seconds'");
		assertThat(send(sale)).hasStatus(HttpStatus.CREATED);
		assertThat(mercadoPago.calls("createOrder")).hasSize(2);
	}

	@Test
	void aBusyTerminalSaysWhoseChargeItIs() {
		long first = cardSale();
		send(first);

		var result = send(cardSale());

		assertProblem(result, HttpStatus.CONFLICT, "POINT_BUSY");
		assertThat(result).bodyJson().isLenientlyEqualTo("""
				{"saleId": %d, "amount": 18000, "terminalName": "Smart 1"}""".formatted(first));
		assertThat(mercadoPago.calls("createOrder")).hasSize(1);
	}

	@Test
	void anotherTerminalIsFree() {
		send(cardSale());

		assertThat(send(cardSale(), SMART_2)).hasStatus(HttpStatus.CREATED);
	}

	@Test
	void phonesSendingDifferentSalesAtOnceLeaveOneOrderPerTerminal() throws Exception {
		long[] sales = LongStream.range(0, 4).map(i -> cardSale()).toArray();
		CountDownLatch start = new CountDownLatch(1);
		int created = 0;
		try (ExecutorService phones = Executors.newFixedThreadPool(sales.length)) {
			List<Future<Boolean>> answers = LongStream.of(sales).mapToObj(sale -> phones.submit((Callable<Boolean>) () -> {
				start.await();
				try {
					return pointOrderService.send(sale, SMART_1, "barra").created();
				}
				catch (PointException busy) {
					return false;
				}
			})).toList();
			start.countDown();
			for (Future<Boolean> answer : answers) {
				created += answer.get() ? 1 : 0;
			}
		}

		assertThat(created).isEqualTo(1);
		assertThat(mercadoPago.orderIds()).hasSize(1);
		assertThat(pointOrderRepository.count()).isEqualTo(1);
	}

	@Test
	void phonesSendingTheSameSaleAtOnceChargeItOnce() throws Exception {
		long sale = cardSale();
		CountDownLatch start = new CountDownLatch(1);
		try (ExecutorService phones = Executors.newFixedThreadPool(4)) {
			List<Future<PointOrderService.Sent>> answers = LongStream.range(0, 4)
				.mapToObj(i -> phones.submit((Callable<PointOrderService.Sent>) () -> {
					start.await();
					return pointOrderService.send(sale, SMART_1, "barra");
				}))
				.toList();
			start.countDown();
			for (Future<PointOrderService.Sent> answer : answers) {
				assertThat(answer.get().order().saleId()).isEqualTo(sale);
			}
		}

		assertThat(mercadoPago.orderIds()).hasSize(1);
		assertThat(mercadoPago.calls("createOrder")).hasSize(1);
	}

	@Test
	void rejectsATerminalThatIsNotOnTheList() {
		long sale = cardSale();

		assertProblem(send(sale, "SMART-9"), HttpStatus.BAD_REQUEST, "POINT_TERMINAL_UNKNOWN");
		assertThat(post("/api/sales/" + sale + "/point-order", "{}")).hasStatus(HttpStatus.BAD_REQUEST);
		assertThat(mercadoPago.calls()).isEmpty();
	}

	@Test
	void onlyActiveMercadoPagoSalesOfAnOpenEventAreCharged() {
		long cash = sale(PaymentMethod.EFECTIVO);
		long voided = cardSale();
		post("/api/sales/" + voided + "/void", "{}");
		long closed = cardSale();

		assertProblem(send(cash), HttpStatus.CONFLICT, "SALE_NOT_CHARGEABLE");
		assertProblem(send(voided), HttpStatus.CONFLICT, "SALE_NOT_CHARGEABLE");
		jdbcTemplate.update("UPDATE event SET status = 'CLOSED', closed_at = now()");
		assertProblem(send(closed), HttpStatus.CONFLICT, "SALE_NOT_CHARGEABLE");
		assertThat(mercadoPago.calls()).isEmpty();
	}

	@Test
	void answers404WithoutTheSaleOrItsOrder() {
		assertThat(send(999999)).hasStatus(HttpStatus.NOT_FOUND);
		assertThat(follow(999999)).hasStatus(HttpStatus.NOT_FOUND);
		assertProblem(follow(cardSale()), HttpStatus.NOT_FOUND, "POINT_ORDER_NOT_FOUND");
	}

	@Test
	void followingWithoutMercadoPagoChangesNothing() {
		long sale = cardSale();
		send(sale);
		mercadoPago.down(true);

		assertProblem(follow(sale), HttpStatus.BAD_GATEWAY, "POINT_UNAVAILABLE");

		assertThat(order(sale).getStatus()).isEqualTo("created");
	}

}
