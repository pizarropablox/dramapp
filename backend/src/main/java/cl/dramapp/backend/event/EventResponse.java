package cl.dramapp.backend.event;

import java.time.Instant;
import java.time.LocalDate;

public record EventResponse(Long id, String name, LocalDate eventDate, EventStatus status, Instant openedAt,
		Instant closedAt) {

	public static EventResponse from(Event event) {
		return new EventResponse(event.getId(), event.getName(), event.getEventDate(), event.getStatus(),
				event.getOpenedAt(), event.getClosedAt());
	}

}
