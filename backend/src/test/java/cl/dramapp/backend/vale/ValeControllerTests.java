package cl.dramapp.backend.vale;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import cl.dramapp.backend.point.FakeMercadoPagoClient.Failure;
import cl.dramapp.backend.point.PointOrderService;
import cl.dramapp.backend.point.PointScenario;
import cl.dramapp.backend.sale.PaymentMethod;

@WithMockUser(username = "barra", roles = "BARRA")
class ValeControllerTests extends PointScenario {

	@Autowired
	private ValePrintRepository valePrintRepository;

	@Autowired
	private PointOrderService pointOrderService;

	private long cashSale() {
		return sale(PaymentMethod.EFECTIVO);
	}

	private MvcTestResult print(long saleId) {
		return post("/api/sales/" + saleId + "/vale", "{\"terminalId\": \"SMART-1\"}");
	}

	private MvcTestResult vale(long saleId) {
		return mvc.get().uri("/api/sales/" + saleId + "/vale").exchange();
	}

	private MvcTestResult reprint(long saleId) {
		return post("/api/vales/latest/reprint", "{\"saleId\": %d, \"terminalId\": \"SMART-1\"}".formatted(saleId));
	}

	private MvcTestResult sendCancelingVale(long saleId) {
		return post("/api/sales/" + saleId + "/point-order",
				"{\"terminalId\": \"SMART-1\", \"cancelPendingVale\": true}");
	}

	private void valesWereRequestedSecondsAgo(int seconds) {
		jdbcTemplate.update("UPDATE vale_print SET requested_at = now() - make_interval(secs => ?)", seconds);
	}

	private static void assertProblem(MvcTestResult result, HttpStatus status, String code) {
		assertThat(result).hasStatus(status);
		assertThat(result).bodyJson().extractingPath("$.code").isEqualTo(code);
	}

	private static void assertVale(MvcTestResult result, String state, String kind) {
		assertThat(result).hasStatus2xxSuccessful();
		assertThat(result).bodyJson().isLenientlyEqualTo("""
				{"state": "%s", "kind": "%s"}""".formatted(state, kind));
	}

	// ---- card -----------------------------------------------------------------------------------------------------

	@Test
	void theValeIsPrintedAsSoonAsThePaymentIsSeenAndNeverBefore() {
		long sale = cardSale();
		send(sale);
		mercadoPago.orderBecomes(mpOrderId(), "at_terminal", "at_terminal");
		follow(sale);
		assertThat(mercadoPago.printIds()).isEmpty();

		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		var result = follow(sale);

		assertThat(result).bodyJson().isLenientlyEqualTo("""
				{"state": "PAID", "vale": {"state": "PENDING", "kind": "ORIGINAL", "terminalName": "Smart 1",
				 "busy": false, "mayBeDouble": false}}""");
		assertThat(mercadoPago.printIds()).hasSize(1);
		assertThat(mercadoPago.printContent(mpPrintId())).contains("[ ] TROPICAL GIN (promo){br}[ ] TROPICAL GIN (promo)")
			.contains("[ ] CERVEZA NORMAL{br}")
			.contains("Total $17.000 · Venta #" + sale)
			.contains("Propina $1.000")
			.doesNotContain("REIMPRESIÓN");
		assertThat(valePrintRepository.findAll()).singleElement()
			.satisfies(print -> assertThat(print.getRequestedBy()).isEqualTo("barra"));
	}

	@Test
	void followingAPaidSalePrintsOnceAndFollowsItsVale() {
		long sale = paidSale();
		mercadoPago.printBecomes(mpPrintId(), "on_terminal");
		assertThat(follow(sale)).bodyJson().extractingPath("$.vale.state").isEqualTo("PRINTING");
		mercadoPago.printBecomes(mpPrintId(), "processed");
		assertThat(follow(sale)).bodyJson().extractingPath("$.vale.state").isEqualTo("PRINTED");
		int asked = mercadoPago.calls("getPrint").size();
		follow(sale);

		assertThat(mercadoPago.calls("createPrint")).hasSize(1);
		assertThat(mercadoPago.calls("getPrint")).hasSize(asked);
	}

	@Test
	void phonesSeeingThePaymentAtOncePrintOnce() throws Exception {
		long sale = cardSale();
		send(sale);
		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		CountDownLatch start = new CountDownLatch(1);
		try (ExecutorService phones = Executors.newFixedThreadPool(4)) {
			List<Future<?>> answers = IntStream.range(0, 4).<Future<?>>mapToObj(i -> phones.submit((Callable<?>) () -> {
				start.await();
				return pointOrderService.follow(sale);
			})).toList();
			start.countDown();
			for (Future<?> answer : answers) {
				answer.get();
			}
		}

		assertThat(mercadoPago.calls("createPrint")).hasSize(1);
		assertThat(valePrintRepository.count()).isEqualTo(1);
	}

	@ParameterizedTest
	@ValueSource(strings = { "canceled", "expired", "failed", "action_required", "refunded" })
	void nothingElsePrints(String status) {
		long sale = cardSale();
		send(sale);
		mercadoPago.orderBecomes(mpOrderId(), status, status);

		follow(sale);

		assertThat(mercadoPago.printIds()).isEmpty();
	}

	@Test
	void aPaymentOnAVoidedSaleDoesNotPrint() {
		long sale = cardSale();
		send(sale);
		mercadoPago.orderBecomes(mpOrderId(), "canceled", "canceled");
		follow(sale);
		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		follow(sale);

		assertThat(mercadoPago.printIds()).isEmpty();
	}

	@Test
	void closedByHandAsPaidPrintsOnceEvenIfItIsVerifiedLater() {
		long sale = cardSale();
		send(sale);
		mercadoPago.orderBecomes(mpOrderId(), "action_required", "check_on_terminal");
		// The Smart no longer holds the order, although Mercado Pago does not say so.
		mercadoPago.failNextPrint(Failure.CREATED_BUT_LOST);
		mercadoPago.orderBecomes(mpOrderId(), "something_new", null);
		post("/api/sales/" + sale + "/point-order/resolve", "{\"outcome\": \"PAID\"}");
		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		follow(sale);

		assertThat(mercadoPago.calls("createPrint")).hasSize(1);
	}

	@Test
	void aCardSaleThatIsNotPaidHasNoVale() {
		long sale = cardSale();
		assertProblem(print(sale), HttpStatus.CONFLICT, "VALE_NOT_ALLOWED");
		send(sale);
		assertProblem(print(sale), HttpStatus.CONFLICT, "VALE_NOT_ALLOWED");

		assertThat(mercadoPago.printIds()).isEmpty();
	}

	// ---- cash -----------------------------------------------------------------------------------------------------

	@Test
	void cashPrintsOnlyWhenReceivedAndOnce() {
		long sale = cashSale();
		assertThat(vale(sale)).hasStatus(HttpStatus.NOT_FOUND);

		var first = print(sale);
		assertThat(first).hasStatus(HttpStatus.CREATED);
		assertVale(first, "PENDING", "ORIGINAL");
		assertThat(print(sale)).hasStatus(HttpStatus.OK);

		assertThat(mercadoPago.calls("createPrint")).hasSize(1);
		mercadoPago.printBecomes(mpPrintId(), "processed");
		assertVale(vale(sale), "PRINTED", "ORIGINAL");
	}

	@Test
	void aVoidedSaleHasNoVale() {
		long sale = cashSale();
		post("/api/sales/" + sale + "/void", "{}");

		assertProblem(print(sale), HttpStatus.CONFLICT, "VALE_NOT_ALLOWED");
	}

	@Test
	void answers404And400() {
		assertThat(print(999999)).hasStatus(HttpStatus.NOT_FOUND);
		assertThat(vale(999999)).hasStatus(HttpStatus.NOT_FOUND);
		assertProblem(post("/api/sales/" + cashSale() + "/vale", "{\"terminalId\": \"SMART-9\"}"),
				HttpStatus.BAD_REQUEST, "POINT_TERMINAL_UNKNOWN");
		assertThat(post("/api/vales/latest/reprint", "{}")).hasStatus(HttpStatus.BAD_REQUEST);
	}

	// ---- rejected, lost, expired ----------------------------------------------------------------------------------

	@Test
	void withAChargeOnTheSmartTheValeIsRejectedAndAskedAgainAsTheOriginal() {
		long other = cardSale();
		send(other);
		long sale = cashSale();

		var rejected = print(sale);
		assertVale(rejected, "REJECTED", "ORIGINAL");
		assertThat(rejected).bodyJson().isLenientlyEqualTo("""
				{"busy": true, "error": "already_queued_order_on_terminal"}""");

		mercadoPago.orderBecomes(mpOrderId(), "canceled", "canceled");
		follow(other);
		var again = print(sale);
		assertThat(again).hasStatus(HttpStatus.CREATED);
		assertVale(again, "PENDING", "ORIGINAL");
		assertThat(mercadoPago.printContent(mpPrintId())).doesNotContain("REIMPRESIÓN");
	}

	@Test
	void askingForARejectedValeNeverPrintsItOnItsOwn() {
		long sale = cashSale();
		mercadoPago.failNextPrint(Failure.BUSY);
		print(sale);

		vale(sale);
		vale(sale);

		assertThat(mercadoPago.calls("createPrint")).hasSize(1);
	}

	@ParameterizedTest
	@EnumSource(value = Failure.class, names = { "LOST", "CREATED_BUT_LOST", "KEY_USED" })
	void withoutACertainRejectionTheOriginalKeepsItsPlace(Failure failure) {
		long sale = cashSale();
		mercadoPago.failNextPrint(failure);
		print(sale);
		valesWereRequestedSecondsAgo(13);

		assertVale(vale(sale), "UNKNOWN", "ORIGINAL");
		assertThat(print(sale)).hasStatus(HttpStatus.OK);
		assertThat(mercadoPago.calls("createPrint")).hasSize(1);
	}

	@ParameterizedTest
	@CsvSource({ "expired, GONE", "canceled, GONE", "something_new, PRINTING" })
	void itsStateComesFromTheStatus(String status, String state) {
		long sale = cashSale();
		print(sale);
		mercadoPago.printBecomes(mpPrintId(), status);

		assertVale(vale(sale), state, "ORIGINAL");
	}

	// ---- reprint --------------------------------------------------------------------------------------------------

	@Test
	void reprintingCancelsFirstWhatTheSmartHasNotTaken() {
		long sale = cashSale();
		print(sale);
		String first = mpPrintId();

		var result = reprint(sale);

		assertVale(result, "PENDING", "REPRINT");
		assertThat(result).bodyJson().extractingPath("$.mayBeDouble").isEqualTo(false);
		assertThat(mercadoPago.calls("cancelPrint")).containsExactly("cancelPrint " + first);
		assertThat(mercadoPago.printContent(mpPrintId())).startsWith("{center}{b}REIMPRESIÓN{/b}{/center}{br}");
		assertThat(valePrintRepository.findBySaleIdOrderById(sale)).extracting(ValePrint::getStatus)
			.containsExactly("canceled", "created");
	}

	@Test
	void reprintingWhatCameOutWarnsThatItMayBeDouble() {
		long sale = cashSale();
		print(sale);
		mercadoPago.printBecomes(mpPrintId(), "processed");

		var result = reprint(sale);

		assertVale(result, "PENDING", "REPRINT");
		assertThat(result).bodyJson().extractingPath("$.mayBeDouble").isEqualTo(true);
		assertThat(mercadoPago.calls("cancelPrint")).isEmpty();
	}

	@Test
	void reprintingAnExpiredValeIsNotDouble() {
		long sale = cashSale();
		print(sale);
		mercadoPago.printBecomes(mpPrintId(), "expired");

		assertThat(reprint(sale)).bodyJson().extractingPath("$.mayBeDouble").isEqualTo(false);
	}

	@ParameterizedTest
	@ValueSource(strings = { "on_terminal", "something_new" })
	void itIsNotReprintedWhileItComesOut(String status) {
		long sale = cashSale();
		print(sale);
		mercadoPago.printBecomes(mpPrintId(), status);

		assertProblem(reprint(sale), HttpStatus.CONFLICT, "VALE_PRINTING");
		mercadoPago.printBecomes(mpPrintId(), "processed");
		assertVale(reprint(sale), "PENDING", "REPRINT");
	}

	@Test
	void itIsNotReprintedIfThePreviousOneCannotBeCanceled() {
		long sale = cashSale();
		print(sale);
		mercadoPago.cancelPrintWorks(false);

		assertProblem(reprint(sale), HttpStatus.CONFLICT, "VALE_STUCK");

		assertThat(mercadoPago.calls("createPrint")).hasSize(1);
	}

	@Test
	void anUnknownOneIsReprintedWithTheWarning() {
		long sale = cashSale();
		mercadoPago.failNextPrint(Failure.LOST);
		print(sale);
		assertProblem(reprint(sale), HttpStatus.CONFLICT, "VALE_PRINTING");

		valesWereRequestedSecondsAgo(13);
		var result = reprint(sale);

		assertVale(result, "PENDING", "REPRINT");
		assertThat(result).bodyJson().extractingPath("$.mayBeDouble").isEqualTo(true);
	}

	@Test
	void aBusySmartRejectsTheReprintWhichCanBeAskedAgain() {
		long sale = cashSale();
		print(sale);
		mercadoPago.printBecomes(mpPrintId(), "processed");
		mercadoPago.failNextPrint(Failure.BUSY);

		var rejected = reprint(sale);
		assertVale(rejected, "REJECTED", "REPRINT");
		assertThat(rejected).bodyJson().extractingPath("$.busy").isEqualTo(true);
		// The original came out: asking for it answers what there is.
		assertThat(print(sale)).hasStatus2xxSuccessful();
		assertThat(mercadoPago.calls("createPrint")).hasSize(2);

		assertVale(reprint(sale), "PENDING", "REPRINT");
	}

	@Test
	void onlyTheLastValeOfTheSmartIsReprinted() {
		long first = cashSale();
		print(first);
		mercadoPago.printBecomes(mpPrintId(), "processed");
		long second = cashSale();
		print(second);

		assertProblem(reprint(first), HttpStatus.CONFLICT, "VALE_NOT_LATEST");
		assertProblem(reprint(cashSale()), HttpStatus.CONFLICT, "VALE_NOT_LATEST");
		assertVale(reprint(second), "PENDING", "REPRINT");
	}

	@Test
	void everyReprintIsStoredWithItsTimeAndAccount() {
		long sale = cashSale();
		print(sale);
		reprint(sale);
		reprint(sale);

		assertThat(valePrintRepository.findBySaleIdOrderById(sale)).hasSize(3).allSatisfy(print -> {
			assertThat(print.getRequestedBy()).isEqualTo("barra");
			assertThat(print.getRequestedAt()).isNotNull();
			assertThat(print.getMpActionId()).isNotNull();
		});
	}

	@Test
	void tappingReprintTwiceAtOnceNeverPrintsTwice() throws Exception {
		long sale = cashSale();
		print(sale);
		mercadoPago.printBecomes(mpPrintId(), "processed");
		CountDownLatch start = new CountDownLatch(1);
		try (ExecutorService phones = Executors.newFixedThreadPool(4)) {
			List<Future<MvcTestResult>> answers = IntStream.range(0, 4)
				.mapToObj(i -> phones.submit(() -> {
					start.await();
					return mvc.post()
						.uri("/api/vales/latest/reprint")
						.with(user("barra").roles("BARRA"))
						.contentType(MediaType.APPLICATION_JSON)
						.content("{\"saleId\": %d, \"terminalId\": \"SMART-1\"}".formatted(sale))
						.exchange();
				}))
				.toList();
			start.countDown();
			for (Future<MvcTestResult> answer : answers) {
				answer.get();
			}
		}

		// One more at a time: whatever was accepted later canceled the one before it.
		long alive = mercadoPago.printIds()
			.stream()
			.filter(id -> !valePrintRepository.findAll()
				.stream()
				.filter(print -> id.equals(print.getMpActionId()))
				.allMatch(print -> "canceled".equals(print.getStatus()) || "processed".equals(print.getStatus())))
			.count();
		assertThat(alive).isLessThanOrEqualTo(1);
	}

	// ---- a charge right after another -----------------------------------------------------------------------------

	@Test
	void aChargeWaitsForTheValeOfThePreviousOneWithoutReachingMercadoPago() {
		long paid = paidSale();
		long next = cardSale();

		var result = send(next);

		assertProblem(result, HttpStatus.CONFLICT, "POINT_PRINTING");
		assertThat(result).bodyJson().extractingPath("$.saleId").isEqualTo((int) paid);
		assertThat(mercadoPago.calls("createOrder")).hasSize(1);
		assertThat(pointOrderRepository.countBySaleId(next)).isZero();

		// Nobody follows the paid sale any more: the next one finds out on its own.
		mercadoPago.printBecomes(mpPrintId(), "processed");
		assertThat(send(next)).hasStatus(HttpStatus.CREATED);
	}

	@Test
	void theOtherSmartDoesNotWait() {
		paidSale();

		assertThat(send(cardSale(), SMART_2)).hasStatus(HttpStatus.CREATED);
	}

	@Test
	void aValeWithoutAnswerHoldsTheSmartOnly45Seconds() {
		mercadoPago.failNextPrint(Failure.LOST);
		paidSale();
		long next = cardSale();
		valesWereRequestedSecondsAgo(44);
		assertProblem(send(next), HttpStatus.CONFLICT, "POINT_PRINTING");

		valesWereRequestedSecondsAgo(46);
		assertThat(send(next)).hasStatus(HttpStatus.CREATED);
	}

	@Test
	void after45SecondsMercadoPagoDecidesAndTheStuckValeIsNamed() {
		long paid = paidSale();
		valesWereRequestedSecondsAgo(46);
		long next = cardSale();

		var result = send(next);

		assertProblem(result, HttpStatus.CONFLICT, "POINT_BUSY_VALE");
		assertThat(result).bodyJson().extractingPath("$.saleId").isEqualTo((int) paid);
	}

	@Test
	void theSaleAlreadyBeingChargedDoesNotWait() {
		long sale = cardSale();
		send(sale);
		post("/api/sales/" + cashSale() + "/vale", "{\"terminalId\": \"SMART-1\"}");

		assertThat(send(sale)).hasStatus(HttpStatus.OK);
	}

	@Test
	void cancelingThePendingValeChargesAndLeavesItToReprint() {
		long paid = paidSale();
		valesWereRequestedSecondsAgo(60);
		long next = cardSale();
		send(next);

		assertThat(sendCancelingVale(next)).hasStatus(HttpStatus.CREATED);

		assertVale(vale(paid), "GONE", "ORIGINAL");
		assertThat(mercadoPago.calls("createOrder")).last().isEqualTo("createOrder test-sale-" + next + "-2");
	}

	@ParameterizedTest
	@ValueSource(strings = { "processed", "expired", "canceled" })
	void aValeThatIsOverDoesNotStopTheCharge(String status) {
		paidSale();
		valesWereRequestedSecondsAgo(60);
		mercadoPago.printBecomes(mpPrintId(), status);

		assertThat(sendCancelingVale(cardSale())).hasStatus(HttpStatus.CREATED);
		assertThat(mercadoPago.calls("cancelPrint")).isEmpty();
	}

	@Test
	void aValeComingOutIsWaitedFor() {
		paidSale();
		valesWereRequestedSecondsAgo(60);
		mercadoPago.printBecomes(mpPrintId(), "on_terminal");

		assertProblem(sendCancelingVale(cardSale()), HttpStatus.CONFLICT, "VALE_PRINTING");
		assertThat(mercadoPago.calls("createOrder")).hasSize(1);
	}

	@Test
	void aValeThatCannotBeCanceledStopsTheCharge() {
		paidSale();
		valesWereRequestedSecondsAgo(60);
		mercadoPago.cancelPrintWorks(false);

		assertProblem(sendCancelingVale(cardSale()), HttpStatus.CONFLICT, "VALE_STUCK");
		assertThat(mercadoPago.calls("createOrder")).hasSize(1);
	}

}
