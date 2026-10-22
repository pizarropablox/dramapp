package cl.dramapp.backend.refund;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.PostgresIntegrationTest;
import cl.dramapp.backend.event.Event;
import cl.dramapp.backend.event.EventRepository;
import jakarta.persistence.EntityManager;

/** The entity guards amount and reason too; these check the database itself (V5). */
@SpringBootTest
@Transactional
class RefundRepositoryTests extends PostgresIntegrationTest {

	@Autowired
	private RefundRepository refundRepository;

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private EntityManager entityManager;

	@Autowired
	private JdbcTemplate jdbcTemplate;

	private Event event() {
		return eventRepository.saveAndFlush(new Event("DRAMA Octubre", LocalDate.of(2026, 10, 24)));
	}

	private Refund refund() {
		return refundRepository.saveAndFlush(new Refund(event(), 15000, "se acabó el Jack"));
	}

	private int insert(long eventId, long amount, String reason) {
		return jdbcTemplate.update("INSERT INTO refund (event_id, amount, reason) VALUES (?, ?, ?)", eventId, amount,
				reason);
	}

	@Test
	void savesAndReadsARefund() {
		Refund saved = refund();
		entityManager.clear();

		Refund read = refundRepository.findById(saved.getId()).orElseThrow();

		assertThat(read.getAmount()).isEqualTo(15000);
		assertThat(read.getReason()).isEqualTo("se acabó el Jack");
		assertThat(read.getStatus()).isEqualTo(RefundStatus.ACTIVE);
		assertThat(read.getCreatedAt()).isNotNull();
		assertThat(read.getVoidedAt()).isNull();
		assertThat(read.getEvent().getId()).isEqualTo(saved.getEvent().getId());
	}

	@Test
	void keepsAVoidedRefundWithItsTime() {
		Refund refund = refund();

		refund.voidRefund();
		refundRepository.saveAndFlush(refund);
		entityManager.clear();

		Refund read = refundRepository.findById(refund.getId()).orElseThrow();
		assertThat(read.getStatus()).isEqualTo(RefundStatus.VOIDED);
		assertThat(read.getVoidedAt()).isAfterOrEqualTo(read.getCreatedAt());
	}

	@Test
	void databaseRejectsAnAmountThatIsNotPositive() {
		Event event = event();

		assertThatThrownBy(() -> insert(event.getId(), 0, "prueba")).isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_refund_amount");
	}

	@Test
	void databaseRejectsABlankReason() {
		Event event = event();

		assertThatThrownBy(() -> insert(event.getId(), 1000, "   "))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_refund_reason_not_blank");
	}

	@Test
	void databaseRejectsAMissingReason() {
		Event event = event();

		assertThatThrownBy(() -> insert(event.getId(), 1000, null)).isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("reason");
	}

	@Test
	void databaseRejectsAVoidedRefundWithoutItsTime() {
		Refund refund = refund();

		assertThatThrownBy(() -> jdbcTemplate.update("UPDATE refund SET status = 'VOIDED' WHERE id = ?",
				refund.getId()))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_refund_voided_at");
	}

	@Test
	void databaseRejectsAVoidBeforeTheRefund() {
		Refund refund = refund();

		assertThatThrownBy(() -> jdbcTemplate.update(
				"UPDATE refund SET status = 'VOIDED', voided_at = created_at - interval '1 minute' WHERE id = ?",
				refund.getId()))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_refund_voided_after_created");
	}

	@Test
	void databaseRejectsAnUnknownStatus() {
		Refund refund = refund();

		assertThatThrownBy(() -> jdbcTemplate.update("UPDATE refund SET status = 'DELETED' WHERE id = ?",
				refund.getId()))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ck_refund_status");
	}

}
