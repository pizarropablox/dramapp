package cl.dramapp.backend.vale;

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

/** The entity and the database itself (V9): a single original vale per sale is guarded by the index. */
@SpringBootTest
@Transactional
class ValePrintRepositoryTests extends PostgresIntegrationTest {

	private static final String SMART = "SMART-1";

	@Autowired
	private ValePrintRepository valePrintRepository;

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private SaleRepository saleRepository;

	@Autowired
	private EntityManager entityManager;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	private Event event;

	private Sale sale;

	@BeforeEach
	void createSale() {
		event = eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 27)));
		sale = cashSale();
	}

	/** A cash sale has a vale too, and no Point order. */
	private Sale cashSale() {
		return saleRepository.saveAndFlush(new Sale(event, PaymentMethod.EFECTIVO, 17000, 0));
	}

	private ValePrint print(Sale sale, ValePrintKind kind) {
		return valePrintRepository.saveAndFlush(new ValePrint(sale, SMART, kind, "barra"));
	}

	private ValePrint rejectedOriginal() {
		ValePrint print = new ValePrint(sale, SMART, ValePrintKind.ORIGINAL, "barra");
		print.reject("already_queued_order_on_terminal");
		return valePrintRepository.saveAndFlush(print);
	}

	private void assertNoRoomForAnotherOriginal() {
		assertThatThrownBy(() -> print(sale, ValePrintKind.ORIGINAL))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ux_vale_print_original");
	}

	@Test
	void savesAndReadsAPrint() {
		ValePrint saved = print(sale, ValePrintKind.ORIGINAL);
		entityManager.clear();

		ValePrint read = valePrintRepository.findById(saved.getId()).orElseThrow();

		assertThat(read.getSale().getId()).isEqualTo(sale.getId());
		assertThat(read.getTerminalId()).isEqualTo(SMART);
		assertThat(read.getKind()).isEqualTo(ValePrintKind.ORIGINAL);
		assertThat(read.getRequestedBy()).isEqualTo("barra");
		assertThat(read.getRequestedAt()).isNotNull();
		assertThat(read.getUpdatedAt()).isEqualTo(read.getRequestedAt());
		assertThat(read.getMpActionId()).isNull();
		assertThat(read.getStatus()).isNull();
		assertThat(read.getError()).isNull();
	}

	@Test
	void aSaleHasASingleOriginal() {
		print(sale, ValePrintKind.ORIGINAL);

		assertNoRoomForAnotherOriginal();
	}

	@Test
	void keepsAnAcceptedPrintWithItsAction() {
		ValePrint print = print(sale, ValePrintKind.ORIGINAL);
		print.recordAction("ACT1", "created");
		valePrintRepository.saveAndFlush(print);
		entityManager.clear();

		ValePrint read = valePrintRepository.findById(print.getId()).orElseThrow();

		assertThat(read.getMpActionId()).isEqualTo("ACT1");
		assertThat(read.getStatus()).isEqualTo("created");
		assertThat(read.isRejected()).isFalse();
	}

	@Test
	void aRejectedOriginalMakesRoomForOneMore() {
		ValePrint rejected = rejectedOriginal();
		print(sale, ValePrintKind.ORIGINAL);
		entityManager.clear();

		assertThat(valePrintRepository.findById(rejected.getId()).orElseThrow().getError())
			.isEqualTo("already_queued_order_on_terminal");
		assertNoRoomForAnotherOriginal();
	}

	@Test
	void aSaleMayHaveSeveralRejectedOriginals() {
		rejectedOriginal();
		rejectedOriginal();

		assertThat(print(sale, ValePrintKind.ORIGINAL).getId()).isNotNull();
	}

	@ParameterizedTest
	@ValueSource(strings = { "created", "on_terminal", "processed", "expired", "canceled" })
	void anAcceptedOriginalKeepsItsPlaceWhateverHappens(String status) {
		ValePrint print = new ValePrint(sale, SMART, ValePrintKind.ORIGINAL, "barra");
		print.recordAction("ACT1", status);
		valePrintRepository.saveAndFlush(print);

		assertNoRoomForAnotherOriginal();
	}

	@Test
	void anOriginalWithoutAnAnswerKeepsItsPlace() {
		ValePrint unanswered = print(sale, ValePrintKind.ORIGINAL);

		assertThat(unanswered.getMpActionId()).isNull();
		assertThat(unanswered.isRejected()).isFalse();
		assertNoRoomForAnotherOriginal();
	}

	@Test
	void databaseRejectsARejectedPrintWithAnAction() {
		ValePrint rejected = rejectedOriginal();

		assertThatThrownBy(
				() -> jdbcTemplate.update("UPDATE vale_print SET mp_action_id = 'ACT1' WHERE id = ?", rejected.getId()))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_vale_print_error");
	}

	@Test
	void aSaleMayBeReprintedManyTimes() {
		print(sale, ValePrintKind.ORIGINAL);
		print(sale, ValePrintKind.REPRINT);
		print(sale, ValePrintKind.REPRINT);

		assertThat(valePrintRepository.count()).isEqualTo(3);
	}

	@Test
	void eachSaleHasItsOwnOriginal() {
		print(sale, ValePrintKind.ORIGINAL);

		assertThat(print(cashSale(), ValePrintKind.ORIGINAL).getId()).isNotNull();
	}

	@Test
	void anActionOfMercadoPagoIsStoredOnce() {
		ValePrint original = print(sale, ValePrintKind.ORIGINAL);
		ValePrint reprint = print(sale, ValePrintKind.REPRINT);
		jdbcTemplate.update("UPDATE vale_print SET mp_action_id = 'ACT1' WHERE id = ?", original.getId());

		assertThatThrownBy(
				() -> jdbcTemplate.update("UPDATE vale_print SET mp_action_id = 'ACT1' WHERE id = ?", reprint.getId()))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ux_vale_print_action");
	}

	@Test
	void databaseRejectsAnUnknownKind() {
		ValePrint original = print(sale, ValePrintKind.ORIGINAL);

		assertThatThrownBy(
				() -> jdbcTemplate.update("UPDATE vale_print SET kind = 'COPY' WHERE id = ?", original.getId()))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_vale_print_kind");
	}

}
