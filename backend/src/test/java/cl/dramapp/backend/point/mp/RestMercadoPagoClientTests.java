package cl.dramapp.backend.point.mp;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.headerDoesNotExist;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withRawStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

import java.io.IOException;
import java.net.http.HttpTimeoutException;
import java.util.HashSet;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.json.JsonCompareMode;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.client.RestClient;

import cl.dramapp.backend.point.PointProperties;
import cl.dramapp.backend.point.mp.MpResult.NoAnswer;
import cl.dramapp.backend.point.mp.MpResult.Ok;
import cl.dramapp.backend.point.mp.MpResult.Reason;
import cl.dramapp.backend.point.mp.MpResult.Rejected;
import tools.jackson.databind.json.JsonMapper;

/** The requests and answers seen with the real Smart in the spike (DRAMA-70) and the Prueba 0 (DRAMA-71). */
@ExtendWith(OutputCaptureExtension.class)
class RestMercadoPagoClientTests {

	private static final String TOKEN = "APP_USR-1234567890-secret";

	private static final String BASE = "https://mp.test";

	private static final String ORDER = """
			{"id": "ORD1", "status": "created", "status_detail": "created",
			 "transactions": {"payments": [{"id": "PAY1", "amount": "100", "status": "created"}]}}""";

	private static final String BUSY = """
			{"errors": [{"code": "already_queued_order_on_terminal", "message": "There is already a queued order."}]}""";

	private final RestClient.Builder builder = RestClient.builder();

	private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

	private final MercadoPagoClient client = MercadoPagoConfig.client(builder,
			new PointProperties(TOKEN, "SMART-1=Smart 1", "no_ticket", "test", BASE), new JsonMapper());

	@AfterEach
	void noTransactionIsLeft() {
		TransactionSynchronizationManager.setActualTransactionActive(false);
	}

	private void answer(int status, String body) {
		server.expect(requestTo(startsWith(BASE)))
			.andRespond(withRawStatus(status).body(body).contentType(MediaType.APPLICATION_JSON));
	}

	@Test
	void createsAnOrderExemptFromIvaWithoutTicketAndForThreeHours() {
		server.expect(requestTo(BASE + "/v1/orders"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(header("Authorization", "Bearer " + TOKEN))
			.andExpect(header("X-Idempotency-Key", "test-sale-182"))
			.andExpect(content().contentType(MediaType.APPLICATION_JSON))
			.andExpect(content().json("""
					{
					  "type": "point",
					  "external_reference": "test-sale-182",
					  "expiration_time": "PT3H",
					  "description": "Fiesta DRAMA",
					  "transactions": {"payments": [{"amount": "18000"}]},
					  "config": {"point": {"terminal_id": "SMART-1", "print_on_terminal": "no_ticket"}},
					  "taxes": [{"payer_condition": "payment_exempt_iva"}]
					}""", JsonCompareMode.STRICT))
			.andRespond(withStatus(HttpStatus.CREATED).body(ORDER).contentType(MediaType.APPLICATION_JSON));

		assertThat(client.createOrder("test-sale-182", "SMART-1", 18000))
			.isEqualTo(new Ok<>(new MpOrder("ORD1", "created", "created", "PAY1", null)));
		server.verify();
	}

	@Test
	void readsAPaidOrderWithoutItsCard() {
		server.expect(requestTo(BASE + "/v1/orders/ORD1"))
			.andExpect(method(HttpMethod.GET))
			.andExpect(headerDoesNotExist("X-Idempotency-Key"))
			.andRespond(withStatus(HttpStatus.OK).body("""
					{"id": "ORD1", "status": "processed", "status_detail": "accredited",
					 "transactions": {"payments": [{"id": "PAY1", "reference_id": "190", "status": "processed",
					  "card": {"last_four_digits": "1234"}}]}}""").contentType(MediaType.APPLICATION_JSON));

		assertThat(client.getOrder("ORD1"))
			.isEqualTo(new Ok<>(new MpOrder("ORD1", "processed", "accredited", "PAY1", "190")));
	}

	@Test
	void cancelsAnOrderAlsoOnTheTerminal() {
		server.expect(requestTo(BASE + "/v1/orders/ORD1/cancel"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(header("x-allow-cancelable-status", "at_terminal"))
			.andExpect(content().string(""))
			.andRespond(withStatus(HttpStatus.ACCEPTED).body(ORDER).contentType(MediaType.APPLICATION_JSON));

		assertThat(client.cancelOrder("ORD1")).isEqualTo(new Ok<>(null));
		server.verify();
	}

	@Test
	void printsKeepingTheAccents() {
		server.expect(requestTo(BASE + "/terminals/v1/actions"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(content().json("""
					{
					  "type": "print",
					  "external_reference": "test-vale-7",
					  "config": {"point": {"terminal_id": "SMART-1", "subtype": "custom"}},
					  "content": "Miércoles · ñ"
					}""", JsonCompareMode.STRICT))
			.andRespond(withStatus(HttpStatus.CREATED).body("""
					{"id": "ACT1", "status": "created"}""").contentType(MediaType.APPLICATION_JSON));

		assertThat(client.createPrint("test-vale-7", "SMART-1", "Miércoles · ñ"))
			.isEqualTo(new Ok<>(new MpPrint("ACT1", "created")));
		server.verify();
	}

	@Test
	void readsAPrint() {
		answer(200, """
				{"id": "ACT1", "status": "expired"}""");

		assertThat(client.getPrint("ACT1")).isEqualTo(new Ok<>(new MpPrint("ACT1", "expired")));
	}

	@ParameterizedTest
	@ValueSource(ints = { 200, 202, 204 })
	void cancelsAPrintWithAnySuccessEvenWithoutABody(int status) {
		server.expect(requestTo(BASE + "/terminals/v1/actions/ACT1/cancel"))
			.andExpect(method(HttpMethod.POST))
			.andRespond(withRawStatus(status));

		assertThat(client.cancelPrint("ACT1")).isEqualTo(new Ok<>(null));
	}

	@Test
	void everyCallThatChangesSomethingHasItsOwnKey() {
		Set<String> keys = new HashSet<>();
		for (int i = 0; i < 2; i++) {
			for (String path : new String[] { "/v1/orders/ORD1/cancel", "/terminals/v1/actions",
					"/terminals/v1/actions/ACT1/cancel" }) {
				server.expect(requestTo(BASE + path))
					.andExpect(request -> keys.add(request.getHeaders().getFirst("X-Idempotency-Key")))
					.andRespond(withStatus(HttpStatus.CREATED).body("""
							{"id": "ACT1", "status": "created"}""").contentType(MediaType.APPLICATION_JSON));
			}
		}
		for (int i = 0; i < 2; i++) {
			client.cancelOrder("ORD1");
			client.createPrint("reference", "SMART-1", "content");
			client.cancelPrint("ACT1");
		}

		assertThat(keys).hasSize(6).doesNotContainNull();
	}

	@ParameterizedTest
	@ValueSource(strings = { "already_queued_order_on_terminal", "already_queued_order_for_terminal" })
	void theTerminalIsBusyWithEitherName(String code) {
		answer(409, BUSY.replace("already_queued_order_on_terminal", code));

		assertThat(client.createOrder("key", "SMART-1", 100))
			.isEqualTo(new Rejected<>(409, code, Reason.TERMINAL_BUSY));
	}

	@Test
	void aPrintFindsTheTerminalBusyToo() {
		answer(409, BUSY);

		assertThat(client.createPrint("reference", "SMART-1", "content"))
			.isEqualTo(new Rejected<>(409, "already_queued_order_on_terminal", Reason.TERMINAL_BUSY));
	}

	@Test
	void aUsedKeyIsToldApartFromABusyTerminal() {
		answer(409, """
				{"errors": [{"code": "idempotency_key_already_used"}]}""");

		assertThat(client.createOrder("key", "SMART-1", 100))
			.isEqualTo(new Rejected<>(409, "idempotency_key_already_used", Reason.KEY_USED));
	}

	@ParameterizedTest
	@CsvSource({ "400, property_value, OTHER", "409, cannot_cancel_order, OTHER", "409, something_new, OTHER",
			"401, unauthorized, NOT_CONFIGURED", "403, forbidden, NOT_CONFIGURED",
			"404, terminal_not_found, NOT_CONFIGURED" })
	void theRestOfThe4xxKeepTheirCode(int status, String code, Reason reason) {
		answer(status, "{\"errors\": [{\"code\": \"" + code + "\"}]}");

		assertThat(client.createOrder("key", "SMART-1", 100)).isEqualTo(new Rejected<>(status, code, reason));
	}

	@ParameterizedTest
	@ValueSource(strings = { "", "not json", "{}", "[]", "{\"errors\": []}", "{\"errors\": [{\"code\": null}]}" })
	void a4xxWithoutACodeIsStillARejection(String body) {
		answer(400, body);

		assertThat(client.createOrder("key", "SMART-1", 100))
			.isEqualTo(new Rejected<>(400, "http_400", Reason.OTHER));
	}

	@Test
	void aVeryLongCodeFitsItsColumn() {
		answer(400, "{\"error\": \"" + "x".repeat(200) + "\"}");

		assertThat(client.createOrder("key", "SMART-1", 100))
			.isEqualTo(new Rejected<>(400, "x".repeat(64), Reason.OTHER));
	}

	@ParameterizedTest
	@ValueSource(ints = { 302, 408, 429, 500, 502, 503 })
	void theseProveNothing(int status) {
		answer(status, BUSY);

		assertThat(client.createOrder("key", "SMART-1", 100)).isEqualTo(new NoAnswer<>("http_" + status));
	}

	@Test
	void aTimeoutProvesNothing() {
		server.expect(requestTo(BASE + "/v1/orders"))
			.andRespond(withException(new HttpTimeoutException("request timed out")));

		assertThat(client.createOrder("key", "SMART-1", 100)).isEqualTo(new NoAnswer<>("HttpTimeoutException"));
	}

	@ParameterizedTest
	@ValueSource(strings = { "", "not json", "{}", "{\"id\": \"ORD1\"}", "{\"status\": \"created\"}" })
	void aSuccessThatCannotBeReadProvesNothing(String body) {
		answer(201, body);

		assertThat(client.createOrder("key", "SMART-1", 100)).isEqualTo(new NoAnswer<>("unreadable"));
	}

	@Test
	void neverLogsTheTokenNorTheBodies(CapturedOutput output) throws IOException {
		answer(401, "{\"errors\": [{\"code\": \"unauthorized\", \"message\": \"" + TOKEN + "\"}]}");
		answer(500, "{\"card\": \"1234\"}");
		server.expect(requestTo(BASE + "/v1/orders")).andRespond(withException(new IOException(TOKEN)));

		client.createOrder("key", "SMART-1", 100);
		client.createOrder("key", "SMART-1", 100);
		client.createOrder("key", "SMART-1", 100);

		assertThat(output).contains("/v1/orders -> 401 unauthorized").doesNotContain("APP_USR").doesNotContain("1234");
	}

	@Test
	void refusesToCallInsideATransaction() {
		TransactionSynchronizationManager.setActualTransactionActive(true);

		assertThatThrownBy(() -> client.getOrder("ORD1")).isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("inside a transaction");
	}

}
