package cl.dramapp.backend.event;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;

class EventTests {

	@Test
	void newEventIsOpen() {
		Event event = new Event("DRAMA Octubre", LocalDate.of(2026, 10, 31));

		assertThat(event.getStatus()).isEqualTo(EventStatus.OPEN);
		assertThat(event.getOpenedAt()).isNotNull();
		assertThat(event.getClosedAt()).isNull();
	}

	@Test
	void closeMarksTheEventClosedWithItsClosingTime() {
		Event event = new Event("DRAMA Octubre", LocalDate.of(2026, 10, 31));

		event.close();

		assertThat(event.getStatus()).isEqualTo(EventStatus.CLOSED);
		assertThat(event.getClosedAt()).isAfterOrEqualTo(event.getOpenedAt());
	}

	@Test
	void cannotCloseTwice() {
		Event event = new Event("DRAMA Octubre", LocalDate.of(2026, 10, 31));
		event.close();

		assertThatThrownBy(event::close).isInstanceOf(IllegalStateException.class);
	}

}
