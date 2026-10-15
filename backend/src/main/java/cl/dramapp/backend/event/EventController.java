package cl.dramapp.backend.event;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/events")
public class EventController {

	private final EventService eventService;

	public EventController(EventService eventService) {
		this.eventService = eventService;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public EventResponse create(@Valid @RequestBody CreateEventRequest request) {
		return eventService.create(request);
	}

	@GetMapping("/current")
	public EventResponse current() {
		return eventService.current();
	}

	@PostMapping("/{id}/close")
	public EventResponse close(@PathVariable Long id) {
		return eventService.close(id);
	}

}
