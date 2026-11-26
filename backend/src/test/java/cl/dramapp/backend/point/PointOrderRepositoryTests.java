package cl.dramapp.backend.point;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.PostgresIntegrationTest;
import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import cl.dramapp.backend.sale.PaymentMethod;
import cl.dramapp.backend.sale.Sale;
import cl.dramapp.backend.sale.SaleRepository;
import jakarta.persistence.EntityManager;

/** The entity and the database itself (V9): one open order per terminal is guarded by the index. */
@SpringBootTest
@Transactional
class PointOrderRepositoryTests extends PostgresIntegrationTest {

	private static final String SMART = "SMART-1";

	@Autowired
	private PointOrderRepository pointOrderRepository;

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private SaleRepository saleRepository;

	@Autowired
	private EntityManager entityManager;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	private Sale sale;

	private int keys;

	@BeforeEach
	void createSale() {
		Event event = eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 27)));
		sale = saleRepository.saveAndFlush(new Sale(event, PaymentMethod.MERCADO_PAGO, 17000, 1000));
	}

	private PointOrder newOrder(String terminalId) {
		return new PointOrder(sale, terminalId, "test-sale-" + ++keys, "barra");
	}

	private PointOrder saved(PointOrder order) {
		return pointOrderRepository.saveAndFlush(order);
	}

	private PointOrder savedWithStatus(String status) {
		PointOrder order = newOrder(SMART);
		order.recordStatus(status, null);
		return saved(order);
	}

	private PointOrder reload(PointOrder order) {
		entityManager.flush();
		entityManager.clear();
		return pointOrderRepository.findById(order.getId()).orElseThrow();
	}

	private int update(PointOrder order, String assignments) {
		return jdbcTemplate.update("UPDATE point_order SET " + assignments + " WHERE id = ?", order.getId());
	}

	@Test
	void savesAndReadsAnOrder() {
		PointOrder order = newOrder(SMART);
		order.recordStatus("at_terminal", "at_terminal");

		PointOrder read = reload(saved(order));

		assertThat(read.getSale().getId()).isEqualTo(sale.getId());
		assertThat(read.getTerminalId()).isEqualTo(SMART);
		assertThat(read.getIdempotencyKey()).isEqualTo("test-sale-1");
		assertThat(read.getAmount()).isEqualTo(18000);
		assertThat(read.getCreatedBy()).isEqualTo("barra");
		assertThat(read.getStatus()).isEqualTo("at_terminal");
		assertThat(read.getStatusDetail()).isEqualTo("at_terminal");
		assertThat(read.getCreatedAt()).isNotNull();
		assertThat(read.getUpdatedAt()).isAfterOrEqualTo(read.getCreatedAt());
		assertThat(read.getLastCheckedAt()).isNotNull();
		assertThat(read.getMpOrderId()).isNull();
		assertThat(read.getMpPaymentId()).isNull();
		assertThat(read.getReferenceId()).isNull();
		assertThat(read.getCreationError()).isNull();
		assertThat(read.getCancelRequestedAt()).isNull();
		assertThat(read.isPaidOnVoidedSale()).isFalse();
		assertThat(read.getResolvedOutcome()).isNull();
	}

	@Test
	void keepsAnOrderClosedByHandPendingVerification() {
		PointOrder order = savedWithStatus("action_required");
		order.closeByHand(PointOrderOutcome.PAID, "barra");

		PointOrder read = reload(order);

		assertThat(read.isPendingVerification()).isTrue();
		assertThat(read.getResolvedAt()).isNotNull();
		assertThat(read.getResolvedBy()).isEqualTo("barra");
	}

	@ParameterizedTest
	@ValueSource(strings = { "created", "at_terminal", "action_required" })
	void aTerminalTakesOneOpenOrder(String status) {
		savedWithStatus(status);

		assertThatThrownBy(() -> saved(newOrder(SMART))).isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ux_point_order_open");
	}

	@Test
	void anOrderStillBeingSentHoldsItsTerminal() {
		saved(newOrder(SMART));

		assertThatThrownBy(() -> saved(newOrder(SMART))).isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ux_point_order_open");
	}

	@Test
	void anotherTerminalIsFree() {
		savedWithStatus("at_terminal");

		assertThat(saved(newOrder("SMART-2")).getId()).isNotNull();
	}

	@ParameterizedTest
	@ValueSource(strings = { "processed", "canceled", "expired", "failed", "refunded" })
	void aFinishedOrderFreesItsTerminal(String status) {
		savedWithStatus(status);

		assertThat(saved(newOrder(SMART)).getId()).isNotNull();
	}

	@Test
	void aRejectedOrderFreesItsTerminal() {
		PointOrder rejected = newOrder(SMART);
		rejected.rejectCreation("minimum_amount_not_met");
		saved(rejected);

		assertThat(saved(newOrder(SMART)).getId()).isNotNull();
	}

	@Test
	void anOrderClosedByHandFreesItsTerminal() {
		PointOrder closed = savedWithStatus("action_required");
		closed.closeByHand(PointOrderOutcome.NOT_PAID, "barra");
		saved(closed);

		assertThat(saved(newOrder(SMART)).getId()).isNotNull();
	}

	@Test
	void aKeyIsUsedOnce() {
		PointOrder finished = new PointOrder(sale, SMART, "same-key", "barra");
		finished.recordStatus("canceled", null);
		saved(finished);

		assertThatThrownBy(() -> saved(new PointOrder(sale, SMART, "same-key", "barra")))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ux_point_order_idempotency_key");
	}

	@Test
	void anOrderOfMercadoPagoIsStoredOnce() {
		PointOrder first = savedWithStatus("canceled");
		PointOrder second = savedWithStatus("canceled");
		update(first, "mp_order_id = 'ORD1'");

		assertThatThrownBy(() -> update(second, "mp_order_id = 'ORD1'"))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ux_point_order_mp_order");
	}

	@Test
	void databaseRejectsAnAmountThatIsNotPositive() {
		PointOrder order = saved(newOrder(SMART));

		assertThatThrownBy(() -> update(order, "amount = 0")).isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_point_order_amount");
	}

	@Test
	void databaseRejectsARejectedOrderWithAStatus() {
		PointOrder order = savedWithStatus("created");

		assertThatThrownBy(() -> update(order, "creation_error = 'any'"))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_point_order_creation_error");
	}

	@ParameterizedTest
	@ValueSource(strings = { "resolved_outcome = 'PAID'", "resolved_outcome = 'PAID', resolved_at = now()",
			"resolved_at = now()", "resolved_by = 'barra'" })
	void databaseRejectsAnIncompleteCloseByHand(String assignments) {
		PointOrder order = savedWithStatus("action_required");

		assertThatThrownBy(() -> update(order, assignments)).isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_point_order_resolved");
	}

	@Test
	void databaseRejectsAnUnknownOutcome() {
		PointOrder order = savedWithStatus("action_required");

		assertThatThrownBy(
				() -> update(order, "resolved_outcome = 'MAYBE', resolved_at = now(), resolved_by = 'barra'"))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_point_order_outcome");
	}

}
