package cl.dramapp.backend.summary;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/events")
public class EventSummaryController {

	private final EventSummaryService summaryService;

	public EventSummaryController(EventSummaryService summaryService) {
		this.summaryService = summaryService;
	}

	/** The open event's summary or, when none is open, the last closed one's. The literal path wins over {id}. */
	@GetMapping("/latest/summary")
	public EventSummaryResponse latest() {
		return summaryService.latestSummary();
	}

	@GetMapping("/{id}/summary")
	public EventSummaryResponse summary(@PathVariable Long id) {
		return summaryService.summary(id);
	}

}
