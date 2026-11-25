package cl.dramapp.backend.point;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import cl.dramapp.backend.point.FakeMercadoPagoClient.Failure;

/** «Cerrada a mano, por verificar» and «Cobro recibido en una venta anulada», for Ventas. */
@WithMockUser(username = "barra", roles = "BARRA")
class PointSaleMarksTests extends PointScenario {

	private MvcTestResult marks() {
		return mvc.get().uri("/api/point/sales").exchange();
	}

	private void assertMarks(String expected) {
		int asked = mercadoPago.calls().size();

		assertThat(marks()).hasStatus(HttpStatus.OK).bodyJson().isStrictlyEqualTo(expected);

		// It never asks Mercado Pago.
		assertThat(mercadoPago.calls()).hasSize(asked);
	}

	private long closedByHand(String outcome) {
		long sale = cardSale();
		send(sale);
		mercadoPago.orderBecomes(mpOrderId(), "action_required", "check_on_terminal");
		post("/api/sales/" + sale + "/point-order/resolve", "{\"outcome\": \"" + outcome + "\"}");
		return sale;
	}

	@Test
	void thereIsNothingToShowAboutChargesThatEndedWell() {
		long sale = cardSale();
		send(sale);
		assertMarks("[]");

		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		follow(sale);
		assertMarks("[]");
	}

	@Test
	void closedByHandAsPaidIsShownUntilItIsVerified() {
		long sale = closedByHand("PAID");
		assertMarks("""
				[{"saleId": %d, "amount": 18000, "pendingVerification": true, "paidOnVoidedSale": false}]"""
			.formatted(sale));

		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		follow(sale);
		assertMarks("[]");
	}

	@Test
	void closedByHandWithoutKnowingTheOrderIsShownToo() {
		long sale = cardSale();
		mercadoPago.failNextOrder(Failure.LOST);
		send(sale);
		post("/api/sales/" + sale + "/point-order/resolve", "{\"outcome\": \"PAID\"}");

		assertMarks("""
				[{"saleId": %d, "amount": 18000, "pendingVerification": true, "paidOnVoidedSale": false}]"""
			.formatted(sale));
	}

	@Test
	void closedByHandAsNotPaidIsNotShown() {
		closedByHand("NOT_PAID");

		assertMarks("[]");
	}

	@Test
	void aPaymentOnAVoidedSaleIsShown() {
		long sale = cardSale();
		send(sale);
		mercadoPago.orderBecomes(mpOrderId(), "canceled", "canceled");
		follow(sale);
		assertMarks("[]");

		mercadoPago.orderBecomes(mpOrderId(), "processed", "accredited");
		follow(sale);
		assertMarks("""
				[{"saleId": %d, "amount": 18000, "pendingVerification": false, "paidOnVoidedSale": true}]"""
			.formatted(sale));
	}

	@Test
	void onlyThoseOfTheOpenEvent() {
		closedByHand("PAID");
		jdbcTemplate.update("UPDATE event SET status = 'CLOSED', closed_at = now()");

		assertMarks("[]");
	}

}
