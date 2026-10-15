package cl.dramapp.backend.event;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class EventService {

	private final EventRepository eventRepository;

	public EventService(EventRepository eventRepository) {
		this.eventRepository = eventRepository;
	}

	/** Creates an event, already open. Only one event can be open at a time. */
	@Transactional
	public EventResponse create(CreateEventRequest request) {
		eventRepository.findByStatus(EventStatus.OPEN).ifPresent(open -> {
			throw new EventAlreadyOpenException(open.getName());
		});
		try {
			// Flush now so a concurrent create hitting ux_event_single_open becomes a 409, not a 500.
			Event event = eventRepository.saveAndFlush(new Event(request.name().strip(), request.eventDate()));
			return EventResponse.from(event);
		}
		catch (DataIntegrityViolationException ex) {
			if (ex.getMessage() != null && ex.getMessage().contains("ux_event_single_open")) {
				throw new EventAlreadyOpenException(ex);
			}
			throw ex;
		}
	}

	@Transactional(readOnly = true)
	public EventResponse current() {
		return eventRepository.findByStatus(EventStatus.OPEN)
			.map(EventResponse::from)
			.orElseThrow(EventNotFoundException::noOpenEvent);
	}

	@Transactional
	public EventResponse close(Long id) {
		Event event = eventRepository.findById(id).orElseThrow(() -> EventNotFoundException.byId(id));
		if (event.getStatus() == EventStatus.CLOSED) {
			throw new EventAlreadyClosedException(event);
		}
		event.close();
		return EventResponse.from(eventRepository.saveAndFlush(event));
	}

}
