package cl.dramapp.backend.refund;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.PostgresIntegrationTest;
import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import jakarta.persistence.EntityManager;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@WithMockUser(roles = "BARRA")
class RefundControllerTests extends PostgresIntegrationTest {

	@Autowired
	private MockMvcTester mvc;

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private RefundRepository refundRepository;

	@Autowired
	private EntityManager entityManager;

	private Event openEvent() {
		return eventRepository.saveAndFlush(new Event("DRAMA Octubre", LocalDate.of(2026, 10, 24)));
	}

	private void close(Event event) {
		event.close();
		eventRepository.saveAndFlush(event);
	}

	private Refund refundIn(Event event, long amount, String reason) {
		return refundRepository.saveAndFlush(new Refund(event, amount, reason));
	}

	private MvcTestResult create(String json) {
		return mvc.post().uri("/api/refunds").contentType(MediaType.APPLICATION_JSON).content(json).exchange();
	}

	private MvcTestResult voidRefund(Long id) {
		return mvc.post().uri("/api/refunds/{id}/void", id).exchange();
	}

	private MvcTestResult recent(String query) {
		return mvc.get().uri("/api/refunds" + query).exchange();
	}

	private Refund reload(Refund refund) {
		entityManager.flush();
		entityManager.clear();
		return refundRepository.findById(refund.getId()).orElseThrow();
	}

	/** 400 with a single validation error, and nothing saved. */
	private void assertRejected(MvcTestResult result, String error) {
		assertThat(result).hasStatus(HttpStatus.BAD_REQUEST)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
			.isEqualTo(error);
		assertThat(refundRepository.count()).isZero();
	}

	private void assertConflict(MvcTestResult result, String title) {
		assertThat(result).hasStatus(HttpStatus.CONFLICT)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.title").isEqualTo(title);
	}

	// --- Creating ---

	@Test
	void createsARefundInTheOpenEventAndReturnsIt() {
		Event event = openEvent();

		var result = create("""
				{"amount": 15000, "reason": "  se acabó el Jack "}""");

		assertThat(result).hasStatus(HttpStatus.CREATED).hasContentTypeCompatibleWith(MediaType.APPLICATION_JSON);
		assertThat(result).bodyJson().extractingPath("$.id").asNumber().isNotNull();
		assertThat(result).bodyJson().extractingPath("$.eventId").convertTo(Long.class).isEqualTo(event.getId());
		assertThat(result).bodyJson().extractingPath("$.amount").isEqualTo(15000);
		assertThat(result).bodyJson().extractingPath("$.reason").isEqualTo("se acabó el Jack");
		assertThat(result).bodyJson().extractingPath("$.status").isEqualTo("ACTIVE");
		assertThat(result).bodyJson().extractingPath("$.createdAt").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$.voidedAt").isNull();
		assertThat(refundRepository.findAll()).singleElement()
			.satisfies(saved -> assertThat(saved.getReason()).isEqualTo("se acabó el Jack"));
	}

	@Test
	void rejectsAMissingReason() {
		openEvent();

		assertRejected(create("""
				{"amount": 15000}"""), "reason: El motivo es obligatorio.");
	}

	@Test
	void rejectsABlankReason() {
		openEvent();

		for (String reason : new String[] { "", "   " }) {
			assertRejected(create("""
					{"amount": 15000, "reason": "%s"}""".formatted(reason)), "reason: El motivo es obligatorio.");
		}
	}

	@Test
	void rejectsAReasonLongerThan100Characters() {
		openEvent();

		assertRejected(create("""
				{"amount": 15000, "reason": "%s"}""".formatted("x".repeat(101))),
				"reason: El motivo no puede superar los 100 caracteres.");
	}

	@Test
	void acceptsAReasonOfExactly100Characters() {
		openEvent();
		String reason = "x".repeat(100);

		var result = create("""
				{"amount": 15000, "reason": "%s"}""".formatted(reason));

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.reason").isEqualTo(reason);
	}

	@Test
	void rejectsAMissingAmount() {
		openEvent();

		assertRejected(create("""
				{"reason": "prueba"}"""), "amount: El monto es obligatorio.");
	}

	@Test
	void rejectsAnAmountThatIsNotPositive() {
		openEvent();

		for (String amount : new String[] { "0", "-1" }) {
			assertRejected(create("""
					{"amount": %s, "reason": "prueba"}""".formatted(amount)), "amount: El monto debe ser mayor que $0.");
		}
	}

	@Test
	void acceptsAnAmountEqualToTheCap() {
		openEvent();

		var result = create("""
				{"amount": 100000, "reason": "prueba"}""");

		assertThat(result).hasStatus(HttpStatus.CREATED);
		assertThat(result).bodyJson().extractingPath("$.amount").isEqualTo(100000);
	}

	@Test
	void rejectsAnAmountAboveTheCap() {
		openEvent();

		assertRejected(create("""
				{"amount": 100001, "reason": "prueba"}"""), "amount: La devolución no puede superar $100.000.");
	}

	@Test
	void rejectsARefundWithoutAnOpenEvent() {
		close(openEvent());

		var result = create("""
				{"amount": 15000, "reason": "prueba"}""");

		assertConflict(result, "Sin evento abierto");
		assertThat(result).bodyJson().extractingPath("$.detail")
			.isEqualTo("No hay un evento abierto. Abre un evento antes de registrar devoluciones.");
		assertThat(refundRepository.count()).isZero();
	}

	// --- Voiding ---

	@Test
	void voidsARefundAndKeepsIt() {
		Event event = openEvent();
		Refund refund = refundIn(event, 15000, "monto mal digitado");

		var result = voidRefund(refund.getId());

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.status").isEqualTo("VOIDED");
		assertThat(result).bodyJson().extractingPath("$.voidedAt").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$.amount").isEqualTo(15000);
		Refund saved = reload(refund);
		assertThat(saved.getStatus()).isEqualTo(RefundStatus.VOIDED);
		assertThat(saved.getVoidedAt()).isAfterOrEqualTo(saved.getCreatedAt());
		assertThat(refundRepository.count()).isEqualTo(1);
	}

	@Test
	void rejectsVoidingTwice() {
		Event event = openEvent();
		Refund refund = refundIn(event, 15000, "prueba");
		assertThat(voidRefund(refund.getId())).hasStatus(HttpStatus.OK);

		var result = voidRefund(refund.getId());

		assertConflict(result, "Devolución ya anulada");
		assertThat(result).bodyJson().extractingPath("$.detail").asString()
			.startsWith("La devolución " + refund.getId() + " ya está anulada (a las ");
	}

	@Test
	void rejectsVoidingAnUnknownRefund() {
		openEvent();

		var result = voidRefund(999_999_999L);

		assertThat(result).hasStatus(HttpStatus.NOT_FOUND)
			.hasContentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON);
		assertThat(result).bodyJson().extractingPath("$.title").isEqualTo("Devolución no encontrada");
		assertThat(result).bodyJson().extractingPath("$.detail").isEqualTo("La devolución 999999999 no existe.");
	}

	@Test
	void rejectsVoidingARefundOfAClosedEvent() {
		Event event = openEvent();
		Refund refund = refundIn(event, 15000, "prueba");
		close(event);

		var result = voidRefund(refund.getId());

		assertConflict(result, "Evento cerrado");
		assertThat(result).bodyJson().extractingPath("$.detail")
			.isEqualTo("El evento DRAMA Octubre ya está cerrado: no se pueden anular sus devoluciones.");
		assertThat(reload(refund).getStatus()).isEqualTo(RefundStatus.ACTIVE);
	}

	// --- Recent refunds ---

	@Test
	void listsTheOpenEventRefundsNewestFirstWithTheVoidedOnes() {
		Event previous = openEvent();
		refundIn(previous, 1000, "otro evento");
		close(previous);

		Event event = eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 28)));
		Refund first = refundIn(event, 15000, "se acabó el Jack");
		Refund second = refundIn(event, 5000, "monto mal digitado");
		assertThat(voidRefund(second.getId())).hasStatus(HttpStatus.OK);
		entityManager.flush();
		entityManager.clear();

		var result = recent("");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$[*].id").asArray()
			.containsExactly(second.getId().intValue(), first.getId().intValue());
		assertThat(result).bodyJson().extractingPath("$[*].status").asArray().containsExactly("VOIDED", "ACTIVE");
		assertThat(result).bodyJson().extractingPath("$[0].voidedAt").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$[1].amount").isEqualTo(15000);
		assertThat(result).bodyJson().extractingPath("$[1].reason").isEqualTo("se acabó el Jack");
		assertThat(result).bodyJson().extractingPath("$[1].createdAt").asString().isNotBlank();
		assertThat(result).bodyJson().extractingPath("$[1].voidedAt").isNull();
	}

	@Test
	void limitsTheRecentRefunds() {
		Event event = openEvent();
		for (int i = 0; i < 3; i++) {
			refundIn(event, 1000, "prueba");
		}
		Refund newest = refundIn(event, 2000, "la última");

		var result = recent("?limit=2");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().extractingPath("$.length()").isEqualTo(2);
		assertThat(result).bodyJson().extractingPath("$[0].id").convertTo(Long.class).isEqualTo(newest.getId());
	}

	@Test
	void rejectsALimitOutOfRange() {
		openEvent();

		for (String limit : new String[] { "0", "101" }) {
			var result = recent("?limit=" + limit);

			assertThat(result).hasStatus(HttpStatus.BAD_REQUEST);
			assertThat(result).bodyJson().extractingPath("$.errors").asArray().singleElement().asString()
				.startsWith("limit: El límite");
		}
	}

	@Test
	void listsNothingWithoutAnOpenEvent() {
		Event event = openEvent();
		refundIn(event, 1000, "prueba");
		close(event);

		var result = recent("");

		assertThat(result).hasStatus(HttpStatus.OK);
		assertThat(result).bodyJson().isEqualTo("[]");
	}

}
