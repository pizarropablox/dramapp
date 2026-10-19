package cl.dramapp.backend.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;

import cl.dramapp.backend.PostgresIntegrationTest;
import jakarta.persistence.EntityManager;

@SpringBootTest
@Transactional
class EventRepositoryTests extends PostgresIntegrationTest {

	@Autowired
	private EventRepository eventRepository;

	@Autowired
	private EntityManager entityManager;

	@Test
	void savesAndReadsAnOpenEvent() {
		Event saved = eventRepository.saveAndFlush(new Event("DRAMA Octubre", LocalDate.of(2026, 10, 24)));
		entityManager.clear();

		Event found = eventRepository.findById(saved.getId()).orElseThrow();

		assertThat(found.getName()).isEqualTo("DRAMA Octubre");
		assertThat(found.getEventDate()).isEqualTo(LocalDate.of(2026, 10, 24));
		assertThat(found.getStatus()).isEqualTo(EventStatus.OPEN);
		assertThat(found.getOpenedAt()).isNotNull();
		assertThat(found.getClosedAt()).isNull();
		assertThat(found.getCreatedAt()).isNotNull();
		assertThat(eventRepository.findByStatus(EventStatus.OPEN)).map(Event::getId).contains(saved.getId());
	}

	@Test
	void databaseRejectsASecondOpenEvent() {
		eventRepository.saveAndFlush(new Event("DRAMA Octubre", LocalDate.of(2026, 10, 24)));

		assertThatThrownBy(() -> eventRepository.saveAndFlush(new Event("DRAMA Noviembre", LocalDate.of(2026, 11, 28))))
			.isInstanceOf(DataIntegrityViolationException.class)
			.hasMessageContaining("ux_event_single_open");
	}

}
