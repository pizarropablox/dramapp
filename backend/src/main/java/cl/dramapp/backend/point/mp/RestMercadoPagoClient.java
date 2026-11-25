package cl.dramapp.backend.point.mp;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpResponse;
import org.springframework.util.StringUtils;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import cl.dramapp.backend.point.mp.MpResult.NoAnswer;
import cl.dramapp.backend.point.mp.MpResult.Ok;
import cl.dramapp.backend.point.mp.MpResult.Reason;
import cl.dramapp.backend.point.mp.MpResult.Rejected;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * Logs only the call, the status, Mercado Pago's code and its x-request-id: never the token, headers or bodies, which
 * may carry card data.
 */
class RestMercadoPagoClient implements MercadoPagoClient {

	private static final Logger log = LoggerFactory.getLogger(RestMercadoPagoClient.class);

	/** The longest Mercado Pago allows: an expired order stays on the screen of the Smart. */
	private static final String EXPIRATION = "PT3H";

	private static final String TAX_EXEMPT = "payment_exempt_iva";

	/** The documentation says "for", the API answers "on". */
	private static final Set<String> BUSY_CODES = Set.of("already_queued_order_on_terminal",
			"already_queued_order_for_terminal");

	private static final String KEY_USED_CODE = "idempotency_key_already_used";

	/** 4xx that ask to try again later, so they prove nothing. */
	private static final Set<Integer> UNCERTAIN_STATUSES = Set.of(408, 429);

	private static final int MAX_CODE_LENGTH = 64;

	private final RestClient restClient;

	private final JsonMapper jsonMapper;

	private final String printOnTerminal;

	/** @param restClient with the base URL and the token */
	RestMercadoPagoClient(RestClient restClient, JsonMapper jsonMapper, String printOnTerminal) {
		this.restClient = restClient;
		this.jsonMapper = jsonMapper;
		this.printOnTerminal = printOnTerminal;
	}

	@Override
	public MpResult<MpOrder> createOrder(String key, String terminalId, long amount) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("type", "point");
		body.put("external_reference", key);
		body.put("expiration_time", EXPIRATION);
		body.put("description", "Fiesta DRAMA");
		body.put("transactions", Map.of("payments", List.of(Map.of("amount", Long.toString(amount)))));
		body.put("config", Map.of("point", Map.of("terminal_id", terminalId, "print_on_terminal", printOnTerminal)));
		body.put("taxes", List.of(Map.of("payer_condition", TAX_EXEMPT)));
		return call(HttpMethod.POST, "/v1/orders", key, Map.of(), body, RestMercadoPagoClient::toOrder);
	}

	@Override
	public MpResult<MpOrder> getOrder(String orderId) {
		return call(HttpMethod.GET, "/v1/orders/" + orderId, null, Map.of(), null, RestMercadoPagoClient::toOrder);
	}

	@Override
	public MpResult<Void> cancelOrder(String orderId) {
		// Mercado Pago ignores the header while the order is still created.
		return call(HttpMethod.POST, "/v1/orders/" + orderId + "/cancel", randomKey(),
				Map.of("x-allow-cancelable-status", "at_terminal"), null, null);
	}

	@Override
	public MpResult<MpPrint> createPrint(String reference, String terminalId, String content) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("type", "print");
		body.put("external_reference", reference);
		body.put("config", Map.of("point", Map.of("terminal_id", terminalId, "subtype", "custom")));
		body.put("content", content);
		return call(HttpMethod.POST, "/terminals/v1/actions", randomKey(), Map.of(), body,
				RestMercadoPagoClient::toPrint);
	}

	@Override
	public MpResult<MpPrint> getPrint(String printId) {
		return call(HttpMethod.GET, "/terminals/v1/actions/" + printId, null, Map.of(), null,
				RestMercadoPagoClient::toPrint);
	}

	@Override
	public MpResult<Void> cancelPrint(String printId) {
		return call(HttpMethod.POST, "/terminals/v1/actions/" + printId + "/cancel", randomKey(), Map.of(), null,
				null);
	}

	/** @param reader null for the calls whose answer carries nothing to read: any 2xx is fine, even without a body */
	private <T> MpResult<T> call(HttpMethod method, String path, String key, Map<String, String> headers, Object body,
			Function<JsonNode, T> reader) {
		MercadoPagoClient.requireNoTransaction();
		try {
			RestClient.RequestBodySpec request = restClient.method(method).uri(path);
			headers.forEach(request::header);
			if (key != null) {
				request.header("X-Idempotency-Key", key);
			}
			if (body != null) {
				// Bytes, not String: the JSON must go out as UTF-8 (the vale has accents).
				request.contentType(MediaType.APPLICATION_JSON).body(jsonMapper.writeValueAsBytes(body));
			}
			return request.exchange((sent, response) -> read(method, path, response, reader));
		}
		catch (RestClientException ex) {
			String cause = ex.getMostSpecificCause().getClass().getSimpleName();
			log.warn("Mercado Pago {} {}: no answer ({})", method, path, cause);
			return new NoAnswer<>(cause);
		}
	}

	private <T> MpResult<T> read(HttpMethod method, String path, ClientHttpResponse response,
			Function<JsonNode, T> reader) throws IOException {
		int status = response.getStatusCode().value();
		String requestId = response.getHeaders().getFirst("x-request-id");
		boolean success = status >= 200 && status < 300;
		if (success && reader == null) {
			return new Ok<>(null);
		}
		JsonNode json = parse(response);
		if (success) {
			T value = json == null ? null : reader.apply(json);
			if (value == null) {
				log.warn("Mercado Pago {} {} -> {} unreadable, x-request-id={}", method, path, status, requestId);
				return new NoAnswer<>("unreadable");
			}
			return new Ok<>(value);
		}
		String code = errorCode(json, status);
		log.warn("Mercado Pago {} {} -> {} {}, x-request-id={}", method, path, status, code, requestId);
		if (status < 400 || status >= 500 || UNCERTAIN_STATUSES.contains(status)) {
			return new NoAnswer<>("http_" + status);
		}
		return new Rejected<>(status, code, reason(status, code));
	}

	private JsonNode parse(ClientHttpResponse response) throws IOException {
		String text = new String(response.getBody().readAllBytes(), StandardCharsets.UTF_8);
		try {
			return StringUtils.hasText(text) ? jsonMapper.readTree(text) : null;
		}
		catch (JacksonException ex) {
			return null;
		}
	}

	private static Reason reason(int status, String code) {
		if (BUSY_CODES.contains(code)) {
			return Reason.TERMINAL_BUSY;
		}
		if (KEY_USED_CODE.equals(code)) {
			return Reason.KEY_USED;
		}
		return status == 401 || status == 403 || status == 404 ? Reason.NOT_CONFIGURED : Reason.OTHER;
	}

	private static String errorCode(JsonNode json, int status) {
		String code = null;
		if (json != null) {
			code = text(json.path("errors").path(0), "code");
			if (code == null) {
				code = text(json, "error");
			}
		}
		if (code == null) {
			return "http_" + status;
		}
		return code.length() > MAX_CODE_LENGTH ? code.substring(0, MAX_CODE_LENGTH) : code;
	}

	private static MpOrder toOrder(JsonNode json) {
		String id = text(json, "id");
		String status = text(json, "status");
		if (id == null || status == null) {
			return null;
		}
		JsonNode payment = json.path("transactions").path("payments").path(0);
		return new MpOrder(id, status, text(json, "status_detail"), text(payment, "id"),
				text(payment, "reference_id"));
	}

	private static MpPrint toPrint(JsonNode json) {
		String id = text(json, "id");
		String status = text(json, "status");
		return id == null || status == null ? null : new MpPrint(id, status);
	}

	private static String text(JsonNode node, String field) {
		JsonNode value = node.path(field);
		if (!value.isString() && !value.isNumber()) {
			return null;
		}
		return StringUtils.hasText(value.asString()) ? value.asString() : null;
	}

	private static String randomKey() {
		return UUID.randomUUID().toString();
	}

}
