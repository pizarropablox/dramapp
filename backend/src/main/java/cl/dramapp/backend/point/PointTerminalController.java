package cl.dramapp.backend.point;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/point")
public class PointTerminalController {

	private final PointProperties properties;

	public PointTerminalController(PointProperties properties) {
		this.properties = properties;
	}

	/** What a phone can charge with, besides a Point Mini. Empty when the Point is off. */
	@GetMapping("/terminals")
	public List<PointProperties.Terminal> terminals() {
		return properties.terminalList();
	}

}
